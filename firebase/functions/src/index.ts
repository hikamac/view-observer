/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// import {onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
// import {Firestore} from "firebase-admin/firestore";
import {YouTubeApiService} from "./youtube";
import {defineString} from "firebase-functions/params";
import * as functions from "firebase-functions";
import axios from "axios";
import {VideoInfoItem} from "./model/youtube/video-info-item";
import {onRequest} from "firebase-functions/v1/https";
import {Firestore} from "firebase-admin/firestore";
import {VideoService} from "./firestore/video/video-service";
import {OkResponse} from "./model/ok-response";
import {DocumentNotFoundException} from "./model/firestore/original-exceptions";
// import {Firestore} from "firebase-admin/firestore";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

const options: admin.AppOptions = {};
admin.initializeApp(options);

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// export const addMock = onRequest(async (_, res) => {
//   try {
//     const firestore: Firestore = admin.firestore();
//     const mockDock = {name: "John", calledCount: 0};
//     const result = await firestore.collection("mock").add(mockDock);
//     res
//       .status(200)
//       .setHeader("Content-Type", "application/json")
//       .send(JSON.stringify(result));
//   } catch (err) {
//     res.status(500).setHeader("Content-Type", "text/plain").send(err);
//   }
// });

// export const selectMock = onRequest(async (_, res) => {
//   try {
//     const firestore: Firestore = admin.firestore();
//     const selected = await firestore
//       .collection("mock")
//       .where("name", "==", "John")
//       .get();
//     res
//       .status(200)
//       .setHeader("Content-Type", "application/json")
//       .send(JSON.stringify(selected.docs.map((doc) => doc.data())));
//   } catch (err) {
//     res.status(500).setHeader("Content-Type", "text/plain").send(err);
//   }
// });

export const testYt = functions.pubsub
  .schedule("0,30 * * * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    try {
      const youtubeApiService = new YouTubeApiService();
      const targetVideoId = defineString("TARGET_VIDEO_ID");
      const videoInfo = await youtubeApiService.listVideoInfo(
        targetVideoId.value(),
      );

      const webhook = defineString("DISCORD_WEBHOOK_URL");
      const content: string = createContent(videoInfo);
      await axios.post(webhook.value(), {content: content});
      return null;
    } catch (err) {
      logger.error("error", err);
      return null;
    }
  });

export const singleInsert = onRequest(async (_, res) => {
  try {
    const videoInfo = await listVideoInfo();
    const firstVideoInfo = videoInfo[0];

    const firestore: Firestore = admin.firestore();
    const videoService = new VideoService(firestore);

    await videoService.insert(firstVideoInfo);
  } catch (err) {
    logger.error("error", err);
    res.status(500).setHeader("Content-Type", "text/plain").send(OkResponse.NG);
  }
});

export const singleUpdate = onRequest(async (_, res) => {
  try {
    const videoInfos = await listVideoInfo();
    const firstVideoInfo = videoInfos[0];

    const firestore: Firestore = admin.firestore();
    const videoService = new VideoService(firestore);

    try {
      await videoService.updateViewCount(
        firstVideoInfo.id,
        Number(firstVideoInfo.statistics.viewCount),
      );
    } catch (err) {
      if (err instanceof DocumentNotFoundException) {
        console.warn(err.message);
      }
    }

    res
      .status(200)
      .setHeader("Content-Type", "application/json")
      .send(JSON.stringify(OkResponse.OK));
  } catch (err) {
    logger.error("error", err);
    res.status(500).setHeader("Content-Type", "text/plain").send(OkResponse.NG);
  }
});

/* */

async function listVideoInfo(): Promise<Array<VideoInfoItem>> {
  const youtubeApiService = new YouTubeApiService();
  const targetVideoId = defineString("TARGET_VIDEO_ID");
  return await youtubeApiService.listVideoInfoItems(targetVideoId.value());
}

function createContent(videoInfo: VideoInfoItem | null): string {
  if (!videoInfo) {
    return "動画情報の取得に失敗しました。";
  }
  const snippet = videoInfo.snippet;
  const statistics = videoInfo.statistics;

  return `${snippet.title}の再生回数が${statistics.viewCount}に到達しました！`;
}
