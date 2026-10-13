/** Metadata shown in the connector settings; knowledge content stays in RAGFlow. */
export interface RagflowDataset {
  /** RAGFlow dataset identifier stored as the retrieval authorization. */
  id: string
  /** Current knowledge-base display name. */
  name: string
}

/** One bounded page of knowledge bases accessible to the saved API Key. */
export interface RagflowDatasetPage {
  /** API-authorized metadata, independent of the retrieval allowlist. */
  datasets: RagflowDataset[]
  /** One-based page number. */
  page: number
  /** Whether another page may exist. */
  has_more: boolean
}
