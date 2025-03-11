import * as functions from "firebase-functions";
import {defineString} from "firebase-functions/params";
import {SecretManager} from "../../service/secret-manager";
import {ViewCountUseCase} from "../../service/usecases/view-count-usecase";
import {firestoreRegion} from "../../constant/setting-value";

/**
 * record view count of documents in "video" collection.
 * if the view count is about to reach the milestone,
 * then also add the notification in "news" collection.
 *
 * FREQ: per 10 minutes(144/d)
 *
 * R: n
 * W: n + a
 */
export const fetchViewCountsAndStore = functions
  .region(firestoreRegion)
  .pubsub.schedule("0,10,20,30,40,50 * * * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    const envVarsName = defineString("ENV_NAME").value();
    const secretVarsName = defineString("SECRET_NAME").value();
    try {
      const env = await SecretManager.setUpAsync(envVarsName);
      const youtubeDataApiKey = env.get<string>("YOUTUBE_DATA_API_KEY");
      const viewCountUseCase = new ViewCountUseCase(youtubeDataApiKey);
      const secret = await SecretManager.setUpAsync(secretVarsName);
      const targetVideoIds = secret.get<string[]>("TARGET_VIDEO_IDS");
      await viewCountUseCase.fetchAndStore(targetVideoIds);
    } catch (error) {
      functions.logger.error(error);
    }
  });
