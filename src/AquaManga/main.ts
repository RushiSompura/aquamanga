import {
  MangaProviding,
  ChapterProviding,
  SearchResultsProviding,
  Request,
  Response,
  SourceManga,
  MangaInfo,
  Chapter,
  ChapterDetails,
  SearchQuery,
  PagedResults,
  SearchResultItem,
  ContentRating,
  SortingOption,
  SearchFilter,
  PaperbackInterceptor,
  BasicRateLimiter,
} from '@paperback/types'

import { load } from 'cheerio'
import pbconfig from './pbconfig'

const DOMAIN = 'https://aquareader.net'

export class AquaMangaExtension implements MangaProviding, ChapterProviding, SearchResultsProviding {
  private async fetchPage(url: string, method: 'GET' | 'POST' = 'GET', body?: string) {
    const request: Request = {
      url,
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      body: body || undefined,
    }
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
      if (u === 'year') d.setFullYear(d.getFullYear() - n); else if (u === 'month') d.setMonth(d.getMonth() - n)
      else if (u === 'week') d.setDate(d.getDate() - n * 7); else if (u === 'day') d.setDate(d.getDate() - n)
      else if (u === 'hour') d.setHours(d.getHours() - n); else if (u === 'minute') d.setMinutes(d.getMinutes() - n)
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

  private resolveMangaId(idOrSource: any): string {
    if (typeof idOrSource === 'string') return idOrSource
    if (idOrSource && idOrSource.mangaId) return idOrSource.mangaId
    if (idOrSource && idOrSource.id) return idOrSource.id
    return String(idOrSource)
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/`)
    const title = $('.post-title h1').text().trim()
    const thumbnail = $('.summary_image img').attr('data-src') || $('.summary_image img').attr('src') || ''
    const author = $('.author-content a').text().trim() || undefined
    const artist = $('.artist-content a').text().trim() || undefined
    const synopsis = $('.description-summary.summary__content, .summary__content').text().trim()
    const st = $('.post-content_item:contains("Status") .summary-content').text().trim().toLowerCase()
    const status = st.includes('ongoing') ? 'Ongoing' : st.includes('completed') ? 'Completed' : st.includes('hiatus') ? 'Hiatus' : st.includes('cancelled') ? 'Cancelled' : 'Ongoing'
    const ratingText = $('span#averagerate').text().trim()
    const rating = ratingText ? parseFloat(ratingText) : undefined
    const tagGroups = this.parseGenres($)

    return {
      mangaId,
      id: mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl: thumbnail,
        synopsis,
        author,
        artist,
        status,
        rating,
        contentRating: ContentRating.MATURE,
        tagGroups,
        titles: [title],
        image: thumbnail,
        desc: synopsis,
      },
    }
  }

  private parseGenres($: any) {
    const tags: { id: string; title: string }[] = []
    $('.genres-content a, .summary-content a[rel="tag"]').each((_: any, el: any) => {
      const g = $(el).text().trim()
      if (g) tags.push({ id: g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), title: g })
    })
    if (tags.length === 0) return []
    return [{ id: 'genres', title: 'Genres', tags }]
  }

  async getChapters(mangaIdOrSource: any, sinceDate?: Date): Promise<Chapter[]> {
    const mangaId = this.resolveMangaId(mangaIdOrSource)
    const $page = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/`)
    const postId = this.getPostId($page) || mangaId
    const $ = await this.fetchPage(`${DOMAIN}/wp-admin/admin-ajax.php`, 'POST', `action=manga_get_chapters&manga=${encodeURIComponent(postId)}`)
    const chs: Chapter[] = []
    const sourceManga = typeof mangaIdOrSource === 'object' ? mangaIdOrSource : { mangaId }
    $('li.wp-manga-chapter').each((_: any, el: any) => {
      const a = $('a', el), href = a.attr('href') || '', title = a.text().trim()
      const slug = href.replace(`${DOMAIN}/manga/${mangaId}/`, '').replace(/\/$/, '').split('/')[0]
      const rawId = slug.replace(/[^a-zA-Z0-9_-]/g, '_')
      const cn = parseFloat(title.match(/(?:chapter|ch\.?|ch)\s*(\d+(?:\.\d+)?)/i)?.[1] || rawId.match(/(?:chapter|ch|vol)?-?(\d+(?:\.\d+)?)/i)?.[1] || '0')
      const chapterId = rawId || `ch_${cn}`
      const dt = $('.chapter-release-date', el).text().trim()
      const publishDate = this.parseDate(dt)
      if (sinceDate && publishDate && publishDate < sinceDate) return
      chs.push({ chapterId, id: chapterId, sourceManga, langCode: 'en', chapNum: cn, title: title || undefined, name: title || undefined, publishDate, time: publishDate, sortingIndex: cn })
    })
    return chs.sort((a, b) => b.chapNum - a.chapNum)
  }

  async getChapterDetails(mangaIdOrChapter: any, chapterId?: string): Promise<ChapterDetails> {
    let mangaId: string, cid: string
    if (typeof mangaIdOrChapter === 'object') {
      mangaId = mangaIdOrChapter.sourceManga?.mangaId || mangaIdOrChapter.sourceManga?.id || mangaIdOrChapter.mangaId || ''
      cid = mangaIdOrChapter.chapterId || mangaIdOrChapter.id || ''
    } else {
      mangaId = mangaIdOrChapter
      cid = chapterId || ''
    }
    const $ = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/${cid}/?style=list`)
    const pages: string[] = []
    $('.reading-content .page-break img, .reading-content img').each((_: any, el: any) => {
      const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || ''
      if (src && !pages.includes(src)) pages.push(src)
    })
    return { id: cid, mangaId, pages }
  }

  async getSearchResults(query: any, metadata: any, _sortingOption?: any): Promise<any> {
    const page = metadata?.page ?? 1
    const title = typeof query === 'string' ? query : (query.title || '')
    const url = page === 1 ? `${DOMAIN}/?s=${encodeURIComponent(title)}&post_type=wp-manga` : `${DOMAIN}/page/${page}/?s=${encodeURIComponent(title)}&post_type=wp-manga`
    const $ = await this.fetchPage(url)
    const items: any[] = []
    $('.c-tabs-item__content, .page-item-detail, .item-summary').each((_: any, el: any) => {
      const a = $('.post-title a', el).first(), href = a.attr('href') || '', title = a.text().trim()
      if (!title || !href) return
      const mid = href.replace(`${DOMAIN}/manga/`, '').replace(/\/$/, '').split('/')[0]
      const img = $('.tab-thumb img, img', el).first().attr('data-src') || $('.tab-thumb img, img', el).first().attr('src') || ''
      items.push({ mangaId: mid, title, imageUrl: img, image: img, contentRating: ContentRating.MATURE })
    })
    return { items, results: items, metadata: $('.next.page-numbers, a.next').length > 0 ? { page: page + 1 } : undefined }
  }

  async getHomePageSections(sectionCallback: (section: any) => void): Promise<void> {
    sectionCallback({ id: 'latest_updates', title: 'Latest Updates', items: [], containsMoreItems: false })
  }

  async getViewMoreItems(_sectionId: string, _metadata: any): Promise<any> {
    return { results: [], items: [] }
  }

  async getSearchFilters(): Promise<SearchFilter[]> { return [] }

  async initialise(): Promise<void> {}
}

export const AquaManga = new AquaMangaExtension()
