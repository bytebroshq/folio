import { DurableObject } from "cloudflare:workers";

export interface DoEnv {
  DB: D1Database;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
}

export class RepoObject extends DurableObject<DoEnv> {
  private prListCache?: { data: unknown[]; fetchedAt: number };
  private tokenCache?: { token: string; expiresAt: number };
  private repoMetaCache?: { owner: string; repo: string; defaultBranch: string };

  constructor(ctx: DurableObjectState, env: DoEnv) {
    super(ctx, env);
  }

  async getRepoMeta(): Promise<{ owner: string; repo: string; defaultBranch: string }> {
    if (this.repoMetaCache) return this.repoMetaCache;
    return { owner: "", repo: "", defaultBranch: "main" };
  }

  async listPRs(): Promise<unknown[]> {
    if (this.prListCache && Date.now() - this.prListCache.fetchedAt < 60_000) {
      return this.prListCache.data;
    }
    const data: unknown[] = [];
    this.prListCache = { data, fetchedAt: Date.now() };
    return data;
  }

  async getPR(number: number): Promise<unknown> {
    return { number, title: "not implemented", body: "" };
  }

  async markReady(number: number): Promise<void> {
    // TODO: fresh authz probe → GitHub API → invalidate cache
  }

  async squashMerge(
    number: number,
    _options: { title: string; body: string },
  ): Promise<void> {
    // TODO: fresh authz probe → GitHub API → delete branch → invalidate cache
  }

  async closePR(number: number): Promise<void> {
    // TODO: GitHub API → invalidate cache
  }

  async deleteBranch(branch: string): Promise<void> {
    // TODO: GitHub API → invalidate cache
  }
}
