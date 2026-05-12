import { ContentRating, ExtensionInfo, SourceIntents } from '@paperback/types'

const pbconfig: ExtensionInfo = {
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

export default pbconfig
