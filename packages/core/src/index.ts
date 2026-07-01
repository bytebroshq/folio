export type User = {
  id: string;
  github_id: number;
  created_at: number;
};

export type Session = {
  id: string;
  user_id: string;
  expires_at: number;
};

export type Installation = {
  id: string;
  user_id: string;
  installation_id: number;
  account_id: number | null;
  created_at: number;
};

export type OAuthState = {
  state: string;
  user_id: string | null;
  code_verifier: string;
  return_to: string | null;
  expires_at: number;
};

export type RepoSlug = { owner: string; repo: string };

export const formatRepo = (s: RepoSlug) => `${s.owner}/${s.repo}`;
export const parseRepo = (s: string): RepoSlug => {
  const [owner, repo] = s.split("/");
  return { owner, repo };
};

export type PRSummary = {
  number: number;
  title: string;
  headRefName: string;
  isDraft: boolean;
  state: "OPEN" | "MERGED" | "CLOSED";
  updatedAt: string;
  url: string;
};

export type PRDetail = PRSummary & {
  body: string;
  files: { path: string; status: string }[];
  diff: string;
  comments: { author: string; body: string }[];
};
