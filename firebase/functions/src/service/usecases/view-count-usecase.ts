import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {NewsRepository} from "../repository/firestore/news-repository";
import {VideoRepository} from "../repository/firestore/video-repository";
import {FieldValue, Timestamp, Transaction} from "firebase-admin/firestore";
import {
  VideoDocument,
  ViewHistory,
  calcMilestone,
  isCloseToNextMilestone,
} from "../../model/firestore/video-document";
import {NewsDocument, NewsCategory} from "../../model/firestore/news-document";
// prettier-ignore
import {
  YouTubeDataApiRepository,
} from "../repository/youtube/youtube-repository";
import {VideoInfoItem} from "../../model/youtube/video-info-item";

export class ViewCountUseCase {
  private youtubeRepo: YouTubeDataApiRepository;
  private firestore: admin.firestore.Firestore;
  private videoRepo: VideoRepository;
  private newsRepo: NewsRepository;
  constructor(youtubeDataApiKey: string) {
    this.youtubeRepo = new YouTubeDataApiRepository(youtubeDataApiKey);
    this.firestore = admin.firestore();
    this.videoRepo = new VideoRepository(this.firestore);
    this.newsRepo = new NewsRepository(this.firestore);
  }

  public async fetchAndStore(targetVideoIds: string[]) {
    const videoIdAndInfoItems = await this.fetchFromYouTube(targetVideoIds);
    const videoIdAndViewCounts = Object.keys(videoIdAndInfoItems).reduce(
      (pre, id) => {
        pre[id] = Number(videoIdAndInfoItems[id].statistics.viewCount);
        return pre;
      },
      {} as Record<string, number>,
    );
    Object.entries(videoIdAndViewCounts).forEach(([videoId, viewCount]) => {
      logger.info(`videoId: ${videoId}, viewCount: ${viewCount}`);
    });
    const results =
      await this.updateVideoAndCreateNewsIfNeeded(videoIdAndViewCounts);
    const documented = new Set(Object.keys(results));
    const notDocumented = Object.keys(videoIdAndInfoItems)
      .filter((id) => !documented.has(id))
      .reduce(
        (pre, id) => {
          pre[id] = videoIdAndInfoItems[id];
          return pre;
        },
        {} as Record<string, VideoInfoItem>,
      );
    await this.insertVideo(notDocumented);
  }

  private async fetchFromYouTube(
    targetVideoIds: string[],
  ): Promise<Record<string, VideoInfoItem>> {
    const videoInfos = await this.youtubeRepo.listVideoInfo(targetVideoIds, [
      "snippet",
      "statistics",
    ]);
    return videoInfos.reduce(
      (pre, videoInfo) => {
        pre[videoInfo.id] = videoInfo;
        return pre;
      },
      {} as Record<string, VideoInfoItem>,
    );
  }

  private async updateVideoAndCreateNewsIfNeeded(
    videoIdAndViewCounts: Record<string, number>,
  ): Promise<Record<string, NewsCategory | null>> {
    return await this.firestore.runTransaction(async (tx: Transaction) => {
      const documentIdAndDocument: Record<string, VideoDocument> =
        await this.videoRepo.getByVideoIdsInTx(
          tx,
          Object.keys(videoIdAndViewCounts),
        );

      const results: Record<string, NewsCategory | null> = Object.values(
        documentIdAndDocument,
      )
        .map((video) => video.videoId)
        .reduce(
          (pre, videoId) => {
            pre[videoId] = null;
            return pre;
          },
          {} as Record<string, NewsCategory | null>,
        );
      for (const [docId, doc] of Object.entries(documentIdAndDocument)) {
        // update video document and create news
        const viewCount = videoIdAndViewCounts[doc.videoId];
        if (viewCount >= doc.milestone) {
          await this.celebrateReaching(
            tx,
            doc.videoId,
            doc.title,
            viewCount,
            doc.milestone,
          );
          await this.setNewMilestone(tx, docId, doc, viewCount);
          results[doc.videoId] = "VIEW_COUNT_REACHED";
        } else if (isCloseToNextMilestone(viewCount)) {
          await this.notifyApproacingMilestone(
            tx,
            doc.videoId,
            doc.title,
            viewCount,
            doc.milestone,
          );
          results[doc.videoId] = "VIEW_COUNT_APPROACH";
        }
        // add sub documents under each video document
        const viewHistory = new ViewHistory({viewCount: viewCount});
        await this.videoRepo.addViewHistoryInTx(tx, docId, viewHistory);
      }
      return results;
    });
  }

  private async insertVideo(
    videoIdAndInfoItems: Record<string, VideoInfoItem>,
  ): Promise<void> {
    const videoBatch = this.videoRepo.startBatch();
    const videoIdAndDocId: Record<string, string> = {};
    for (const [videoId, infoItem] of Object.entries(videoIdAndInfoItems)) {
      const videoDoc = this.convert(infoItem);
      if (!videoDoc) continue;
      const docId = this.videoRepo.addVideoWithBatch(videoBatch, videoDoc);
      videoIdAndDocId[videoId] = docId;
    }
    await this.videoRepo.commitBatch(videoBatch);

    const viewBatch = this.videoRepo.startBatch();
    for (const [videoId, docId] of Object.entries(videoIdAndDocId)) {
      const infoItem = videoIdAndInfoItems[videoId];
      const viewHistory = new ViewHistory({
        viewCount: Number(infoItem.statistics.viewCount),
      });
      this.videoRepo.addViewHistoryWithBatch(viewBatch, docId, viewHistory);
    }
    await this.videoRepo.commitBatch(viewBatch);
  }

  private async setNewMilestone(
    tx: Transaction,
    docId: string,
    oldDoc: VideoDocument,
    viewCount: number,
  ): Promise<void> {
    const newVideoDoc = new VideoDocument({
      ...oldDoc,
      milestone: calcMilestone(viewCount),
    });
    await this.videoRepo.updateVideoInTx(tx, docId, newVideoDoc);
  }

  private async celebrateReaching(
    tx: Transaction,
    videoId: string,
    videoTitle: string,
    viewCount: number,
    oldMilestone: number,
  ): Promise<void> {
    const category: NewsCategory = "VIEW_COUNT_REACHED";
    const newsDoc = new NewsDocument({
      videoId: videoId,
      videoTitle: videoTitle,
      category: category,
      properties: {
        viewCount: viewCount,
        milestone: oldMilestone,
      },
    });
    await this.newsRepo.setNewsInTx(tx, newsDoc);
  }

  private async notifyApproacingMilestone(
    tx: Transaction,
    videoId: string,
    videoTitle: string,
    viewCount: number,
    currentMilestone: number,
  ): Promise<void> {
    const category: NewsCategory = "VIEW_COUNT_APPROACH";
    const newsDoc = new NewsDocument({
      videoId: videoId,
      videoTitle: videoTitle,
      category: category,
      properties: {
        viewCount: viewCount,
        milestone: currentMilestone,
      },
    });
    await this.newsRepo.setNewsInTx(tx, newsDoc);
  }

  private convert(videoInfoItem: VideoInfoItem): VideoDocument | null {
    try {
      const now = FieldValue.serverTimestamp();
      const publishedAtDate = new Date(videoInfoItem.snippet.publishedAt);
      const publishedAt = Timestamp.fromDate(publishedAtDate);
      const milestone = calcMilestone(
        Number(videoInfoItem.statistics.viewCount),
      );
      const vd = new VideoDocument({
        videoId: videoInfoItem.id,
        title: videoInfoItem.snippet.title,
        updated: now,
        channelId: videoInfoItem.snippet.channelId,
        publishedAt: publishedAt,
        milestone: milestone,
      });
      return vd;
    } catch (err) {
      logger.error(err);
      return null;
    }
  }
}
