import * as logger from "firebase-functions/logger";
import {defineString} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";
import {SecretManager} from "../../service/secret-manager";
// prettier-ignore
import {
  AnniversaryUseCase} from "../../service/usecases/anniversary-usecase";
import {OkResponse} from "../../model/ok-response";
import {ViewCountUseCase} from "../../service/usecases/view-count-usecase";
import {firestoreRegion} from "../../constant/setting-value";
import {NewsQueryUseCase} from "../../service/usecases/news-query-usecase";

export const aniv = onRequest(async (_, res) => {
  const envVarsName = defineString("ENV_NAME").value();
  const secretVarsName = defineString("SECRET_NAME").value();
  const env = await SecretManager.setUpAsync(envVarsName);
  const youtubeDataApiKey = env.get<string>("YOUTUBE_DATA_API_KEY");
  const anniversaryUseCase = new AnniversaryUseCase(youtubeDataApiKey);
  const secret = await SecretManager.setUpAsync(secretVarsName);
  const targetVideoIds = secret.get<string[]>("TARGET_VIDEO_IDS");

  try {
    await anniversaryUseCase.checkPublishedAndCelebrateAnniv(targetVideoIds);
    res.send(OkResponse.OK);
  } catch (e) {
    res.status(500).send(e);
  }
});

export const fetchAndStoreD = onRequest(async (_, res) => {
  const envVarsName = defineString("ENV_NAME").value();
  const secretVarsName = defineString("SECRET_NAME").value();
  try {
    const env = await SecretManager.setUpAsync(envVarsName);
    const youtubeDataApiKey = env.get<string>("YOUTUBE_DATA_API_KEY");
    const viewCountUseCase = new ViewCountUseCase(youtubeDataApiKey);
    const secret = await SecretManager.setUpAsync(secretVarsName);
    const targetVideoIds = secret.get<string[]>("TARGET_VIDEO_IDS");

    await viewCountUseCase.fetchAndStore(targetVideoIds);
    res.status(200).send(OkResponse.OK);
  } catch (error) {
    logger.error(error);
    res.status(500).send(OkResponse.NG);
  }
});

export const newsD = onRequest({region: firestoreRegion}, async (_, res) => {
  try {
    const newsQuery = new NewsQueryUseCase();
    const news = await newsQuery.query(20);
    const lastNews = news[news.length - 1];
    const lastViewedId =
      lastNews != null ? lastNews.generateNewsDocumentId() : null;
    res.status(200).send({
      news: news,
      lastViewedId: lastViewedId,
    });
  } catch (err) {
    logger.error("news: ", err);
    res.status(500).send("internal");
  }
});
