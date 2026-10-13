/** Authenticated settings discovery using the Host-owned RAGFlow connection. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RagflowDatasetPage } from './types.ts'

interface CatalogReader {
  readPage: (page: number, signal: AbortSignal) => Promise<RagflowDatasetPage>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of knowledge-base discovery for connector settings. */
    ragflowCatalog: RagflowCatalogController
  }
}

/** Read-only catalog for configuring the retrieval allowlist. */
export class RagflowCatalogController extends TypertRemoteService {
  /**
   * @param ctx - connector lifetime owning the authenticated Remote namespace.
   * @param reader - reads current saved connection settings and server-side credentials.
   */
  constructor(ctx: Context, private readonly reader: CatalogReader) {
    super(ctx, 'ragflowCatalog', { namespace: 'ragflow' })
  }

  /**
   * List API-authorized knowledge-base names even when agent retrieval is disabled.
   * @param page - one-based page, at most 10000.
   * @param signal - caller cancellation forwarded to the RAGFlow HTTP request.
   * @returns a bounded page containing only dataset IDs and names.
   * @throws RemoteError for an invalid page or an unavailable saved connection.
   */
  @Remote
  async listDatasets(page: number, signal: AbortSignal): Promise<RagflowDatasetPage> {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
      throw new RemoteError('gateway/bad-request', 'Invalid RAGFlow dataset page.', {})
    }
    try {
      return await this.reader.readPage(page, signal)
    } catch {
      throw new RemoteError('gateway/internal', 'Cannot load RAGFlow knowledge bases. Check the saved service address and API Key.', {})
    }
  }
}
