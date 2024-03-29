// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'news.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NewsListQueryResponse _$NewsListQueryResponseFromJson(
        Map<String, dynamic> json) =>
    NewsListQueryResponse(
      news: (json['news'] as List<dynamic>)
          .map((e) => NewsDocument.fromJson(e as Map<String, dynamic>))
          .toList(),
      lastViewedId: json['lastViewedId'] as String,
    );

Map<String, dynamic> _$NewsListQueryResponseToJson(
        NewsListQueryResponse instance) =>
    <String, dynamic>{
      'news': instance.news,
      'lastViewedId': instance.lastViewedId,
    };

NewsDocument _$NewsDocumentFromJson(Map<String, dynamic> json) => NewsDocument(
      updated: _dateTimeFromTimestamp(json['updated'] as Map<String, dynamic>),
      videoId: json['videoId'] as String,
      videoTitle: json['videoTitle'] as String,
      category: _newsCategoryFromString(json['category'] as String),
      properties: json['properties'] as Map<String, dynamic>?,
      url: json['url'] as String?,
    );

Map<String, dynamic> _$NewsDocumentToJson(NewsDocument instance) =>
    <String, dynamic>{
      'updated': instance.updated.toIso8601String(),
      'videoId': instance.videoId,
      'videoTitle': instance.videoTitle,
      'category': _$NewsCategoryEnumMap[instance.category]!,
      'properties': instance.properties,
      'url': instance.url,
    };

const _$NewsCategoryEnumMap = {
  NewsCategory.viewCountApproach: 'viewCountApproach',
  NewsCategory.viewCountReached: 'viewCountReached',
  NewsCategory.anniversary: 'anniversary',
};
