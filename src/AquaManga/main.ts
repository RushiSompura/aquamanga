import { Request, Response, ContentRating } from '@paperback/types'
import { load } from 'cheerio'
import pbconfig from './pbconfig'

const DOMAIN = 'https://aquareader.net'

export class AquaMangaExtension {
  private async fetchPage(url: string, method: 'GET' | 'POST' = 'GET', body?: string) {
    const request: Request = { url, method, headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined, body: body || undefined }
    const [_, buffer] = await Application.scheduleRequest(request)
    return load(Application.arrayBufferToUTF8String(buffer))
  }

  private parseDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined
    const t = dateStr.trim()
    const m = t.match(/(\d+)\s+(year|month|week|day|hour|minute)s?\s+ago/i)
    if (m) {
      const n = parseInt(m[1]), u = m[2].toLowerCase()
      const d = new Date()
      if (u === 'year') d.setFullYear(d.getFullYear() - n)
      else if (u === 'month') d.setMonth(d.getMonth() - n)
      else if (u === 'week') d.setDate(d.getDate() - n * 7)
      else if (u === 'day') d.setDate(d.getDate() - n)
      else if (u === 'hour') d.setHours(d.getHours() - n)
      else if (u === 'minute') d.setMinutes(d.getMinutes() - n)
      return d
    }
    const p = Date.parse(t)
    if (!isNaN(p)) return new Date(p)
    const dm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dm) return new Date(parseInt(dm[3]), parseInt(dm[2]) - 1, parseInt(dm[1]))
    const ym = t.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (ym) return new Date(parseInt(ym[1]), parseInt(ym[2]) - 1, parseInt(ym[3]))
  }

  private getPostId($: any): string | undefined {
    return $('div#manga-chapters-holder').attr('data-id')
      || ($('input[name="manga"], input#manga').val() as string)
      || $('article#chapter').attr('data-id')
  }

  async getMangaDetails(mangaId: string): Promise<any> {
    const $ = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/`)
    const title = $('.post-title h1').text().trim()
    const image = $('.summary_image img').attr('data-src') || $('.summary_image img').attr('src') || ''
    const author = $('.author-content a').text().trim()
    const artist = $('.artist-content a').text().trim()
    const desc = $('.description-summary.summary__content, .summary__content').text().trim()
    const st = $('.post-content_item:contains("Status") .summary-content').text().trim().toLowerCase()
    const status = st.includes('ongoing') ? 'Ongoing' : st.includes('completed') ? 'Completed' : st.includes('hiatus') ? 'Hiatus' : st.includes('cancelled') ? 'Cancelled' : 'Ongoing'

    return {
      mangaId, id: mangaId,
      mangaInfo: {
        titles: [title], image, author, artist, desc, status,
        hentai: false, tags: [], covers: [],
        rating: parseFloat($('span#averagerate').text().trim()) || undefined,
      },
    }
  }

  async getChapters(mangaId: string): Promise<any[]> {
    const $page = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/`)
    const postId = this.getPostId($page) || mangaId
    const $ = await this.fetchPage(`${DOMAIN}/wp-admin/admin-ajax.php`, 'POST', `action=manga_get_chapters&manga=${encodeURIComponent(postId)}`)
    const chs: any[] = []
    $('li.wp-manga-chapter').each((_: any, el: any) => {
      const a = $('a', el), href = a.attr('href') || '', title = a.text().trim()
      const slug = href.replace(`${DOMAIN}/manga/${mangaId}/`, '').replace(/\/$/, '').split('/')[0]
      const id = slug.replace(/[^a-zA-Z0-9_-]/g, '_') || `ch_${chs.length + 1}`
      const cn = parseFloat(title.match(/(?:chapter|ch\.?|ch)\s*(\d+(?:\.\d+)?)/i)?.[1] || id.match(/(?:chapter|ch|vol)?-?(\d+(?:\.\d+)?)/i)?.[1] || '0')
      const dt = $('.chapter-release-date', el).text().trim()
      const time = this.parseDate(dt)
      chs.push({ id, chapNum: cn, name: title, langCode: 'en', time, sortingIndex: cn })
    })
    return chs.sort((a, b) => b.chapNum - a.chapNum)
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<any> {
    const $ = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/${chapterId}/?style=list`)
    const pages: string[] = []
    $('.reading-content .page-break img, .reading-content img').each((_: any, el: any) => {
      const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || ''
      if (src && !pages.includes(src)) pages.push(src)
    })
    return { id: chapterId, mangaId, pages }
  }

  async getHomePageSections(sectionCallback: (section: any) => void): Promise<void> {
    const $ = await this.fetchPage(DOMAIN)
    sectionCallback({ id: 'latest_updates', title: 'Latest Updates', items: [], containsMoreItems: true })
    sectionCallback({ id: 'popular_manga', title: 'Popular Manga', items: [], containsMoreItems: true })
  }

  async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<any> {
    const page = metadata?.page ?? 1
    const url = homepageSectionId === 'popular_manga' ? `${DOMAIN}/page/${page}/?m_orderby=rating` : `${DOMAIN}/page/${page}/?m_orderby=latest`
    const $ = await this.fetchPage(url)
    const results: any[] = []
    $('.c-tabs-item__content, .page-item-detail').each((_: any, el: any) => {
      const a = $('.post-title a', el).first(), href = a.attr('href') || '', title = a.text().trim()
      if (!title || !href) return
      const mid = href.replace(`${DOMAIN}/manga/`, '').replace(/\/$/, '').split('/')[0]
      const img = $('.tab-thumb img, img', el).first().attr('data-src') || $('.tab-thumb img, img', el).first().attr('src') || ''
      results.push({ mangaId: mid, title, image: img })
    })
    return { results, metadata: $('.next.page-numbers, a.next').length > 0 ? { page: page + 1 } : undefined }
  }

  async getSearchResults(query: any, metadata: any): Promise<any> {
    const page = metadata?.page ?? 1
    const searchUrl = page === 1 ? `${DOMAIN}/?s=${encodeURIComponent(query.title || '')}&post_type=wp-manga` : `${DOMAIN}/page/${page}/?s=${encodeURIComponent(query.title || '')}&post_type=wp-manga`
    const $ = await this.fetchPage(searchUrl)
    const results: any[] = []
    $('.c-tabs-item__content, .page-item-detail, .item-summary').each((_: any, el: any) => {
      const a = $('.post-title a', el).first(), href = a.attr('href') || '', title = a.text().trim()
      if (!title || !href) return
      const mid = href.replace(`${DOMAIN}/manga/`, '').replace(/\/$/, '').split('/')[0]
      const img = $('.tab-thumb img, img', el).first().attr('data-src') || $('.tab-thumb img, img', el).first().attr('src') || ''
      results.push({ mangaId: mid, title, image: img })
    })
    return { results, metadata: $('.next.page-numbers, a.next').length > 0 ? { page: page + 1 } : undefined }
  }

  async initialise(): Promise<void> {}

  searchRequest(query: any, metadata: any): Promise<any> {
    return this.getSearchResults(query, metadata)
  }

  getMangaShareUrl(mangaId: string): string {
    return `${DOMAIN}/manga/${mangaId}/`
  }

  async getCloudflareBypassRequestAsync(): Promise<any> {
    return { url: DOMAIN, method: 'GET' }
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
