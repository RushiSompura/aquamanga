export class AquaMangaExtension {
  async initialise(): Promise<void> {}

  async getMangaDetails(mangaId: string): Promise<any> {
    return {
      mangaId, id: mangaId,
      mangaInfo: {
        titles: ['Test Manga'],
        image: '',
        author: 'Author',
        artist: 'Artist',
        desc: 'Description',
        status: 'Ongoing',
        hentai: false,
        tags: [],
        covers: [],
      },
    }
  }

  async getChapters(mangaId: string): Promise<any[]> {
    await Promise.resolve()
    return []
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<any> {
    return { id: chapterId, mangaId, pages: [] }
  }

  async getHomePageSections(sectionCallback: (section: any) => void): Promise<void> {
    sectionCallback({ id: 'latest', title: 'Latest', items: [], containsMoreItems: false })
  }

  async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<any> {
    return { results: [] }
  }

  async getSearchResults(query: any, metadata: any): Promise<any> {
    return { results: [] }
  }

  searchRequest(query: any, metadata: any): Promise<any> {
    return this.getSearchResults(query, metadata)
  }

  getMangaShareUrl(mangaId: string): string {
    return ''
  }

  async getCloudflareBypassRequestAsync(): Promise<any> {
    return { url: 'https://aquareader.net', method: 'GET' }
  }

  async getSearchTags(): Promise<any[]> { return [] }
  async getTags(): Promise<any[]> { return [] }
  async getSearchFields(): Promise<any[]> { return [] }
  async getSourceMenu(): Promise<any> { return null }
  async supportsTagExclusion(): Promise<boolean> { return false }
  async supportsSearchOperators(): Promise<boolean> { return false }
}

const instance = new AquaMangaExtension()
export const AquaManga = instance
export const getHomePageSections = instance.getHomePageSections.bind(instance)
export const getViewMoreItems = instance.getViewMoreItems.bind(instance)
export const getMangaDetails = instance.getMangaDetails.bind(instance)
export const getChapters = instance.getChapters.bind(instance)
export const getChapterDetails = instance.getChapterDetails.bind(instance)
export const getSearchResults = instance.getSearchResults.bind(instance)
export const initialise = instance.initialise.bind(instance)
export const searchRequest = instance.searchRequest.bind(instance)
export const getMangaShareUrl = instance.getMangaShareUrl.bind(instance)
export const getCloudflareBypassRequestAsync = instance.getCloudflareBypassRequestAsync.bind(instance)
export const getSearchTags = instance.getSearchTags.bind(instance)
export const getTags = instance.getTags.bind(instance)
export const getSearchFields = instance.getSearchFields.bind(instance)
export const getSourceMenu = instance.getSourceMenu.bind(instance)
export const supportsTagExclusion = instance.supportsTagExclusion.bind(instance)
export const supportsSearchOperators = instance.supportsSearchOperators.bind(instance)
