import { ContentRating, ExtensionInfo, SourceIntents } from '@paperback/types'

const sourceInfo: ExtensionInfo = {
  version: '1.0.0',
  name: 'AquaManga',
  icon: 'icon.png',
  description: 'Extension that pulls content from aquareader.net.',
  contentRating: ContentRating.MATURE,
  developers: [{ name: 'RushiSompura' }],
  language: 'en',
  badges: [],
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
  ],
}

export default {
  ...sourceInfo,
  author: 'RushiSompura',
  desc: sourceInfo.description,
  websiteBaseURL: 'https://aquareader.net',
  lang: sourceInfo.language ?? 'en',
  iconUrl: `https://rushisompura.github.io/aquamanga/AquaManga/static/icon.png`,
}

