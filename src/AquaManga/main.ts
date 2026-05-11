import {
  MangaProviding,
  ChapterProviding,
  SearchResultsProviding,
  Request,
  Response,
  SourceManga,
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

import { load, CheerioAPI } from 'cheerio'
import pbconfig from './pbconfig'

const DOMAIN = 'https://aquareader.net'

class AquaMangaInterceptor extends PaperbackInterceptor {
  constructor() {
    super('aquamanga-interceptor')
  }

  async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...(request.headers || {}),
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Referer': DOMAIN + '/',
    }
    return request
  }

  async interceptResponse(request: Request, response: Response, data: ArrayBuffer): Promise<ArrayBuffer> {
    return data
  }
}

export class AquaMangaExtension implements MangaProviding, ChapterProviding, SearchResultsProviding {
  private readonly interceptor = new AquaMangaInterceptor()
  private readonly rateLimiter = new BasicRateLimiter('aquamanga-ratelimiter', {
    numberOfRequests: 2,
    bufferInterval: 1,
    ignoreImages: true,
  })

  async initialise(): Promise<void> {
    this.rateLimiter.registerInterceptor()
    this.interceptor.registerInterceptor()
  }

  private async fetchPage(url: string, method: 'GET' | 'POST' = 'GET', body?: string): Promise<CheerioAPI> {
    const request: Request = {
      url,
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      body: body || undefined,
    }
    const [_, buffer] = await Application.scheduleRequest(request)
    const html = Application.arrayBufferToUTF8String(buffer)
    return load(html)
  }

  private parseStatus($: CheerioAPI): string | undefined {
    const statusText = $('.post-content_item:contains("Status") .summary-content').text().trim().toLowerCase()
    if (statusText.includes('ongoing')) return 'Ongoing'
    if (statusText.includes('completed')) return 'Completed'
    if (statusText.includes('hiatus') || statusText.includes('on hold')) return 'Hiatus'
    if (statusText.includes('dropped') || statusText.includes('cancelled')) return 'Cancelled'
    return undefined
  }

  private parseDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined
    const trimmed = dateStr.trim()

    const relativeMatch = trimmed.match(/(\d+)\s+(year|month|week|day|hour|minute)s?\s+ago/i)
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1])
      const unit = relativeMatch[2].toLowerCase()
      const now = new Date()
      switch (unit) {
        case 'year': now.setFullYear(now.getFullYear() - amount); break
        case 'month': now.setMonth(now.getMonth() - amount); break
        case 'week': now.setDate(now.getDate() - amount * 7); break
        case 'day': now.setDate(now.getDate() - amount); break
        case 'hour': now.setHours(now.getHours() - amount); break
        case 'minute': now.setMinutes(now.getMinutes() - amount); break
      }
      return now
    }

    const parsed = Date.parse(trimmed)
    if (!isNaN(parsed)) return new Date(parsed)

    const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]))

    const ymd = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (ymd) return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]))

    return undefined
  }

  private extractChapterNumber(chapterId: string, title: string): number {
    const titleMatch = title.match(/(?:chapter|ch\.?|ch)\s*(\d+(?:\.\d+)?)/i)
    if (titleMatch) return parseFloat(titleMatch[1])

    const idMatch = chapterId.match(/(?:chapter|ch|vol)?-?(\d+(?:\.\d+)?)/i)
    if (idMatch) return parseFloat(idMatch[1])

    return 0
  }

  private async getPostId(mangaId: string): Promise<string> {
    const $ = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/`)

    const holderId = $('div#manga-chapters-holder').attr('data-id')
    if (holderId) return holderId

    const inputVal = $('input[name="manga"], input#manga').val() as string | undefined
    if (inputVal) return inputVal

    const articleId = $('article#chapter').attr('data-id')
    if (articleId) return articleId

    return mangaId
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/`)

    const title = $('.post-title h1').text().trim()
    const thumbnail = $('.summary_image img').attr('data-src')
      || $('.summary_image img').attr('src')
      || ''
    const author = $('.author-content a').text().trim() || undefined
    const artist = $('.artist-content a').text().trim() || undefined
    const synopsis = $('.description-summary.summary__content, .summary__content').text().trim()
    const status = this.parseStatus($)
    const ratingText = $('span#averagerate').text().trim()
    const rating = ratingText ? parseFloat(ratingText) : undefined

    const tagGroups = this.parseGenres($)

    return {
      mangaId,
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
      },
    }
  }

  private parseGenres($: CheerioAPI) {
    const genres: { id: string; title: string }[] = []
    $('.genres-content a, .summary-content a[rel="tag"]').each((_, el) => {
      const g = $(el).text().trim()
      if (g) genres.push({ id: g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), title: g })
    })
    if (genres.length === 0) return []
    return [{ id: 'genres', title: 'Genres', tags: genres }]
  }

  async getChapters(sourceManga: SourceManga, sinceDate?: Date): Promise<Chapter[]> {
    const mangaId = sourceManga.mangaId
    const postId = await this.getPostId(mangaId)

    const $ = await this.fetchPage(
      `${DOMAIN}/wp-admin/admin-ajax.php`,
      'POST',
      `action=manga_get_chapters&manga=${encodeURIComponent(postId)}`,
    )

    const chapters: Chapter[] = []

    $('li.wp-manga-chapter').each((_, element) => {
      const anchor = $('a', element)
      const href = anchor.attr('href') || ''
      const title = anchor.text().trim()

      const chapterSlug = href
        .replace(`${DOMAIN}/manga/${mangaId}/`, '')
        .replace(/\/$/, '')
        .split('/')[0]

      const rawChapterId = chapterSlug.replace(/[^a-zA-Z0-9_-]/g, '_')
      const chapNum = this.extractChapterNumber(rawChapterId, title)
      const chapterId = rawChapterId || `chapter_${chapNum}`

      const dateText = $('.chapter-release-date i, .chapter-release-date', element).text().trim()
      const publishDate = this.parseDate(dateText)

      if (sinceDate && publishDate && publishDate < sinceDate) return

      chapters.push({
        chapterId,
        sourceManga,
        langCode: 'en',
        chapNum,
        title: title || undefined,
        publishDate,
        sortingIndex: chapNum,
      })
    })

    return chapters.sort((a, b) => b.chapNum - a.chapNum)
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = chapter.sourceManga.mangaId
    const chapterId = chapter.chapterId
    const $ = await this.fetchPage(`${DOMAIN}/manga/${mangaId}/${chapterId}/?style=list`)

    const pages: string[] = []
    $('.reading-content .page-break img, .reading-content img').each((_, element) => {
      const $el = $(element)
      const imageUrl = $el.attr('data-src')
        || $el.attr('data-lazy-src')
        || $el.attr('src')
        || ''
      if (imageUrl && !pages.includes(imageUrl)) {
        pages.push(imageUrl)
      }
    })

    return {
      id: chapterId,
      mangaId,
      pages,
    }
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    return []
  }

  async getSearchResults(
    query: SearchQuery,
    metadata: unknown,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as { page?: number } | undefined
    const page = meta?.page ?? 1
    const searchUrl = page === 1
      ? `${DOMAIN}/?s=${encodeURIComponent(query.title)}&post_type=wp-manga`
      : `${DOMAIN}/page/${page}/?s=${encodeURIComponent(query.title)}&post_type=wp-manga`

    const $ = await this.fetchPage(searchUrl)

    const items: SearchResultItem[] = []
    $('.c-tabs-item__content, .page-item-detail, .item-summary').each((_, element) => {
      const $el = $(element)
      const titleEl = $el.find('.post-title a').first()
      const href = titleEl.attr('href') || ''
      const title = titleEl.text().trim()

      if (!title || !href) return

      const mangaId = href
        .replace(`${DOMAIN}/manga/`, '')
        .replace(/\/$/, '')
        .split('/')[0]

      const image = $el.find('.tab-thumb img, img').first().attr('data-src')
        || $el.find('.tab-thumb img, img').first().attr('src')
        || ''

      items.push({
        mangaId,
        title,
        imageUrl: image,
        contentRating: ContentRating.MATURE,
      })
    })

    const hasNextPage = $('.next.page-numbers, a.next.page-numbers, a.next').length > 0

    return {
      items,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    }
  }

  async getSortingOptions(query: SearchQuery): Promise<SortingOption[]> {
    return [
      { id: 'latest', label: 'Latest' },
      { id: 'new-manga', label: 'New Manga' },
      { id: 'rating', label: 'Rating' },
      { id: 'trending', label: 'Trending' },
      { id: 'alphabetical', label: 'Alphabetical' },
    ]
  }
}

export const AquaManga = new AquaMangaExtension()
