import { ContentRating } from '@paperback/types'

const OLD_SOURCE_INTENTS = {
  MANGA_CHAPTERS: 1,
  HOMEPAGE_SECTIONS: 4,
  CLOUDFLARE_BYPASS_REQUIRED: 16,
  SETTINGS_UI: 32,
}

export default {
  version: '1.0.0',
  name: 'AquaManga',
  icon: 'icon.png',
  description: 'Extension that pulls content from aquareader.net.',
  contentRating: ContentRating.MATURE,
  websiteBaseURL: 'https://aquareader.net',
  language: 'en',
  author: 'RushiSompura',
  desc: 'Extension that pulls content from aquareader.net.',
  intents:
    OLD_SOURCE_INTENTS.MANGA_CHAPTERS |
    OLD_SOURCE_INTENTS.HOMEPAGE_SECTIONS |
    OLD_SOURCE_INTENTS.CLOUDFLARE_BYPASS_REQUIRED |
    OLD_SOURCE_INTENTS.SETTINGS_UI,
  tags: [],
}
