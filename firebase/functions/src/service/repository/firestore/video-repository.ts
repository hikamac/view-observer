import {
  CollectionReference,
  DocumentReference,
  FieldValue,
  Firestore,
  Timestamp,
  Transaction,
  WriteBatch,
  WriteResult,
} from "firebase-admin/firestore";
import {FirestoreRepository} from "./firestore-repository";
import {
  ViewHistory,
  VideoDocument,
} from "../../../model/firestore/video-document";
import * as logger from "firebase-functions/logger";

const COLLECTION_NAME = "video";
const SUB_COLLECTION_NAME = "view-history";
const BATCH_SIZE = 500;

export class VideoRepository extends FirestoreRepository<VideoDocument> {
  constructor(firestore: Firestore) {
    super(firestore, COLLECTION_NAME);
  }

  public async getVideos(): Promise<Record<string, VideoDocument>> {
    logger.debug("Fetching videos from Firestore");
    const snapshot = await super.getCollection<VideoDocument>().get();
    if (!super.exists(snapshot)) {
      logger.warn("No videos found in Firestore");
      return {};
    }
    const documentIdAndData: Record<string, VideoDocument> =
      snapshot.docs.reduce(
        (acc, doc) => {
          acc[doc.id] = doc.data();
          return acc;
        },
        {} as Record<string, VideoDocument>,
      );
    logger.debug("Fetched videos from Firestore", {documentIdAndData});
    return documentIdAndData;
  }

  public async addVideos(videoDocuments: VideoDocument[]) {
    logger.debug("Adding videos to Firestore", {videoDocuments});
    const batch = super.startBatch();
    for (const vd of videoDocuments) {
      super.addWithBatch(batch, vd);
    }
    const result = await super.commitBatch(batch);
    logger.debug("Added videos to Firestore", {result});
    return result;
  }

  public async getByVideoIdsInTx(
    tx: Transaction,
    videoIds: string[],
  ): Promise<Record<string, VideoDocument>> {
    logger.debug("Fetching videos by IDs in transaction", {videoIds});
    const query = this.videoRef().where("videoId", "in", videoIds);
    const snapshot = await super.getInTx(tx, query);
    if (!super.exists(snapshot)) {
      logger.warn("No videos found for given IDs in transaction");
      return {};
    }
    const documentIdAndData: Record<string, VideoDocument> =
      snapshot.docs.reduce(
        (acc, doc) => {
          acc[doc.id] = doc.data();
          return acc;
        },
        {} as Record<string, VideoDocument>,
      );
    logger.debug("Fetched videos by IDs in transaction", {
      documentIdAndData,
    });
    return documentIdAndData;
  }

  public async updateVideoInTx(
    tx: Transaction,
    docId: string,
    videoDocument: VideoDocument,
  ) {
    logger.debug("Updating video in transaction", {
      docId,
      videoDocument,
    });
    const ref = this.videoRef().doc(docId);
    await super.updateInTx(tx, ref, videoDocument);
    logger.debug("Updated video in transaction", {docId});
  }

  public async addViewHistoryInTx(
    tx: Transaction,
    videoDocId: string,
    viewHistory: ViewHistory,
  ) {
    logger.debug("Adding view history in transaction", {
      videoDocId,
      viewHistory,
    });
    const ref = this.viewHistoryRef(videoDocId).doc();
    const result = await super.addInTx<ViewHistory>(tx, ref, viewHistory);
    logger.debug("Added view history in transaction", {
      videoDocId,
      result,
    });
    return result;
  }

  /* batch */

  public startBatch(): WriteBatch {
    return super.startBatch();
  }

  public addVideoWithBatch(batch: WriteBatch, videoDoc: VideoDocument): string {
    const ref = this.videoRef().doc();
    super.setWithBatch(batch, ref, videoDoc);
    return ref.id;
  }

  public addViewHistoryWithBatch(
    batch: WriteBatch,
    videoDocId: string,
    viewHistory: ViewHistory,
  ) {
    const ref = this.videoRef();
    super.addSubDocumentWithBatch<ViewHistory>(
      batch,
      ref.doc(videoDocId),
      SUB_COLLECTION_NAME,
      viewHistory,
    );
  }

  /*
   * TODO: temporary function to fix bugs
   */
  public async fixViewHistoryCreatedAndUpdated(
    lastDocId: string | undefined,
    batchCount: number,
    totalFixed: number,
  ): Promise<{
    lastDocId: string | undefined;
    batchCount: number;
    totalFixed: number;
  }> {
    const viewHistoryCollection =
      this.firestore.collectionGroup(SUB_COLLECTION_NAME);
    const LIMIT = 500;
    const _batchCount = batchCount + 1;

    let query = viewHistoryCollection.orderBy("updated", "desc").limit(LIMIT);
    if (lastDocId) {
      query = query.startAfter(lastDocId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      logger.debug(`No more documents to process in batch ${batchCount}.`);
      logger.debug(
        `Fetched ${snapshot.size} documents in batch ${batchCount}.`,
      );
      throw Error("complete");
    }

    const batch = this.firestore.batch();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();

      const created =
        data.created && data.created._seconds ? data.created : data.updated;
      let updated = undefined;
      if (data.created && data.created._seconds) {
        updated = data.created;
      } else if (data.updated) {
        updated = data.updated;
      } else {
        updated = FieldValue.serverTimestamp();
      }

      batch.update(doc.ref, {created: created, updated: updated});
    });

    await batch.commit();

    const _totalFixed = totalFixed + snapshot.size;
    logger.debug("All documents have been updated.");
    logger.debug(
      `${_batchCount} batches proceeded, ${_totalFixed} documents are fixed.`,
    );

    const _lastDocId: string | undefined =
      snapshot.size > 0 ? snapshot.docs[snapshot.size - 1].id : undefined;
    return {
      lastDocId: _lastDocId,
      batchCount: _batchCount,
      totalFixed: _totalFixed,
    };
  }

  public async getViewHistoriesBetween(
    videoDocId: string,
    from: Date,
    to: Date,
  ): Promise<{
    docIdAndData: Record<string, ViewHistory>;
    docRefs: DocumentReference[];
  }> {
    const viewHistoryDocs = await this.viewHistoryRef(videoDocId)
      .where("created", ">=", Timestamp.fromDate(from))
      .where("created", "<", Timestamp.fromDate(to))
      .orderBy("created", "asc")
      .get();
    const filteredDocs = viewHistoryDocs.docs.filter((doc) =>
      this.canAlternateWithUpdated(doc),
    );
    const docIdAndData: Record<string, ViewHistory> = filteredDocs.reduce(
      (acc, doc) => {
        acc[doc.id] = doc.data();
        return acc;
      },
      {} as Record<string, ViewHistory>,
    );
    return {
      docIdAndData: docIdAndData,
      docRefs: filteredDocs.map((doc) => doc.ref),
    };
  }

  public async getOldestViewHistory(): Promise<ViewHistory | undefined> {
    const viewHistoryCollection =
      this.firestore.collectionGroup(SUB_COLLECTION_NAME);
    const docsRef = await viewHistoryCollection
      .orderBy("created", "asc")
      .limit(1);
    logger.debug("%o", docsRef);
    const docs = await docsRef.get();
    logger.debug("%o", docs);

    if (docs.empty) {
      return undefined;
    }

    return docs.docs.map((doc) => new ViewHistory(doc.data()))[0];
  }

  public async deleteViewHistriesWithRefs(
    viewHistoryDocRefs: DocumentReference[],
  ) {
    const promises: Promise<WriteResult[]>[] = [];
    for (let i = 0; i < viewHistoryDocRefs.length; i += BATCH_SIZE) {
      const batch = this.startBatch();
      viewHistoryDocRefs.splice(i, i + BATCH_SIZE).forEach((ref) => {
        batch.delete(ref);
      });
      promises.push(batch.commit());
    }
    await Promise.all(promises);
  }

  public async commitBatch(batch: WriteBatch): Promise<WriteResult[]> {
    return await super.commitBatch(batch);
  }

  /* */

  private videoRef(): CollectionReference<VideoDocument> {
    return super.getCollection<VideoDocument>();
  }

  private viewHistoryRef(videoDocId: string): CollectionReference<ViewHistory> {
    const vhRef = this.videoRef().doc(videoDocId);
    return super.getSubCollection<ViewHistory>(vhRef, SUB_COLLECTION_NAME);
  }

  private canAlternateWithUpdated(
    viewHistoryDoc: FirebaseFirestore.QueryDocumentSnapshot<ViewHistory>,
  ): boolean {
    if (
      !viewHistoryDoc.data().created ||
      this.isEmptyMap(viewHistoryDoc.data().created)
    ) {
      // when `created` field is missing or its value is `{}`.
      if (viewHistoryDoc.data().updated) {
        return false;
      } else {
        return true;
      }
    }

    return viewHistoryDoc.data().created instanceof Timestamp;
  }

  private isEmptyMap(
    created: Timestamp | FieldValue | object | undefined,
  ): boolean {
    if (typeof created === "object") {
      if (Object.keys(created).length === 0) {
        return true;
      }
    }
    return false;
  }
}
