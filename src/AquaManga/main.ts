import { load } from 'cheerio'
import { Request, ContentRating } from '@paperback/types'
import pbconfig from './pbconfig'

const DOMAIN = 'https://aquareader.net'

async function fetchPage(url: string, method: 'GET' | 'POST' = 'GET', body?: string) {
  const request: Request = { url, method, headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined, body: body || undefined }
  const [_, buffer] = await Application.scheduleRequest(request)
  return load(Application.arrayBufferToUTF8String(buffer))
}

function parseDate(dateStr: string): Date | undefined {
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

function getPostId($: any): string | undefined {
  return $('div#manga-chapters-holder').attr('data-id') || ($('input[name="manga"], input#manga').val() as string) || $('article#chapter').attr('data-id')
}

const AquaManga: any = {
  async initialise() {},
  async getMangaDetails(mangaId: string) {
    const $ = await fetchPage(`${DOMAIN}/manga/${mangaId}/`)
    const title = $('.post-title h1').text().trim()
    const image = $('.summary_image img').attr('data-src') || $('.summary_image img').attr('src') || ''
    const author = $('.author-content a').text().trim()
    const artist = $('.artist-content a').text().trim()
    const desc = $('.description-summary.summary__content, .summary__content').text().trim()
    const st = $('.post-content_item:contains("Status") .summary-content').text().trim().toLowerCase()
    const status = st.includes('ongoing') ? 'Ongoing' : st.includes('completed') ? 'Completed' : st.includes('hiatus') ? 'Hiatus' : st.includes('cancelled') ? 'Cancelled' : 'Ongoing'
    return {
      mangaId, id: mangaId,
      mangaInfo: { titles: [title], image, author, artist, desc, status, hentai: false, tags: [], covers: [] },
    }
  },
  async getChapters(mangaIdOrSource: any) {
    const mangaId = typeof mangaIdOrSource === 'string' ? mangaIdOrSource : (mangaIdOrSource?.mangaId || mangaIdOrSource?.id || '')
    const $page = await fetchPage(`${DOMAIN}/manga/${mangaId}/`)
    const postId = getPostId($page) || mangaId
    const $ = await fetchPage(`${DOMAIN}/wp-admin/admin-ajax.php`, 'POST', `action=manga_get_chapters&manga=${encodeURIComponent(postId)}`)
    const chs: any[] = []
    $('li.wp-manga-chapter').each((_: any, el: any) => {
      const a = $('a', el), href = a.attr('href') || '', title = a.text().trim()
      const slug = href.replace(`${DOMAIN}/manga/${mangaId}/`, '').replace(/\/$/, '').split('/')[0]
      const rawId = slug.replace(/[^a-zA-Z0-9_-]/g, '_')
      const cn = parseFloat(title.match(/(?:chapter|ch\.?|ch)\s*(\d+(?:\.\d+)?)/i)?.[1] || rawId.match(/(?:chapter|ch|vol)?-?(\d+(?:\.\d+)?)/i)?.[1] || '0')
      const chapterId = rawId || `ch_${cn}`
      const dt = $('.chapter-release-date', el).text().trim()
      const time = parseDate(dt)
      chs.push({ id: chapterId, chapterId, chapNum: cn, name: title, title: title, langCode: 'en', time, publishDate: time, sortingIndex: cn })
    })
    return chs.sort((a: any, b: any) => b.chapNum - a.chapNum)
  },
  async getChapterDetails(mangaId: any, chapterId?: string) {
    const mid = typeof mangaId === 'object' ? (mangaId.sourceManga?.mangaId || mangaId.sourceManga?.id || '') : mangaId
    const cid = chapterId || (typeof mangaId === 'object' ? mangaId.chapterId : '') || ''
    const $ = await fetchPage(`${DOMAIN}/manga/${mid}/${cid}/?style=list`)
    const pages: string[] = []
    $('.reading-content .page-break img, .reading-content img').each((_: any, el: any) => {
      const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || ''
      if (src && !pages.includes(src)) pages.push(src)
    })
    return { id: cid, mangaId: mid, pages }
  },
  async getSearchResults(query: any, metadata: any) {
    const page = metadata?.page ?? 1
    const title = typeof query === 'string' ? query : (query.title || '')
    const url = page === 1 ? `${DOMAIN}/?s=${encodeURIComponent(title)}&post_type=wp-manga` : `${DOMAIN}/page/${page}/?s=${encodeURIComponent(title)}&post_type=wp-manga`
    const $ = await fetchPage(url)
    const results: any[] = []
    $('.c-tabs-item__content, .page-item-detail, .item-summary').each((_: any, el: any) => {
      const a = $('.post-title a', el).first(), href = a.attr('href') || '', title = a.text().trim()
      if (!title || !href) return
      const mid = href.replace(`${DOMAIN}/manga/`, '').replace(/\/$/, '').split('/')[0]
      const img = $('.tab-thumb img, img', el).first().attr('data-src') || $('.tab-thumb img, img', el).first().attr('src') || ''
      results.push({ mangaId: mid, title, image: img, imageUrl: img })
    })
    return { results, items: results, metadata: $('.next.page-numbers, a.next').length > 0 ? { page: page + 1 } : undefined }
  },
  async getHomePageSections(sectionCallback: any) {
    sectionCallback({ id: 'latest_updates', title: 'Latest Updates', items: [], containsMoreItems: false })
  },
  async getViewMoreItems(_sectionId: string, _metadata: any) {
    return { results: [], items: [] }
  },
  async getSearchFilters() { return [] },
  searchRequest(query: any, metadata: any) { return this.getSearchResults(query, metadata) },
  getMangaShareUrl(mangaId: string) { return `${DOMAIN}/manga/${mangaId}/` },
  async getCloudflareBypassRequestAsync() { return { url: DOMAIN, method: 'GET' } },
  async getSearchTags() { return [] },
  async getTags() { return [] },
  async getSearchFields() { return [] },
  async getSourceMenu() { return null },
  async supportsTagExclusion() { return false },
  async supportsSearchOperators() { return false },
}

export { AquaManga }
