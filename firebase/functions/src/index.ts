/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as admin from "firebase-admin";

const options: admin.AppOptions = {};
admin.initializeApp(options);

// //////////////////////////////////////
// AUTO-GENERATED PART
// The content below will be overwritten!
// //////////////////////////////////////

export * from "./controller/apis/firestore/news-api";
export * from "./controller/apis/firestore/video-api";
export * from "./controller/batches/anniversary-batch";
export * from "./controller/batches/fix-view-history-creted.batch";
export * from "./controller/batches/view-count-batch";

