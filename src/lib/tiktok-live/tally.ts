/**
 * Accumulates a live stream's events into a SUMMARY + a keyword-lead list.
 * Pure (no I/O) so it's unit-testable: feed onComment/onViewer/onLike/… then
 * read summary()/leadList(). The connector wires real TikTok events into it.
 */
import { DEFAULT_KEYWORDS, matchKeyword } from "./keyword-match";

export type LiveLead = {
  username: string;
  displayName: string | null;
  keyword: string;
  commentText: string;
  commentedAt: Date;
};

export type LiveSummary = {
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  peakViewers: number;
  avgViewers: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  newFollowers: number;
};

export class LiveTally {
  private keywords: string[];
  private startedAt: Date;
  private samples: number[] = [];
  private leads = new Map<string, LiveLead>();
  peakViewers = 0;
  totalViews = 0;
  likeTotal = 0;
  comments = 0;
  shares = 0;
  follows = 0;

  constructor(keywords: string[], startedAt: Date) {
    this.keywords = keywords && keywords.length ? keywords : DEFAULT_KEYWORDS;
    this.startedAt = startedAt;
  }

  /** Concurrent viewer count (`viewerCount`) → peak + average. */
  onViewer(count: number) {
    if (count > this.peakViewers) this.peakViewers = count;
    if (count > 0) this.samples.push(count);
  }
  onLike(runningTotal: number) {
    if (runningTotal > this.likeTotal) this.likeTotal = runningTotal;
  }
  onComment(username: string, displayName: string | null, text: string, at: Date) {
    this.comments++;
    const kw = matchKeyword(text, this.keywords);
    if (kw && username && !this.leads.has(username)) {
      this.leads.set(username, {
        username,
        displayName,
        keyword: kw,
        commentText: text,
        commentedAt: at,
      });
    }
  }
  onShare() {
    this.shares++;
  }
  onFollow() {
    this.follows++;
  }
  /** Some sources report a cumulative total-viewers figure separately. */
  setTotalViews(n: number) {
    if (n > this.totalViews) this.totalViews = n;
  }

  get leadCount(): number {
    return this.leads.size;
  }
  leadList(): LiveLead[] {
    return [...this.leads.values()];
  }

  summary(endedAt: Date): LiveSummary {
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - this.startedAt.getTime()) / 1000)
    );
    const avgViewers = this.samples.length
      ? Math.round(this.samples.reduce((a, b) => a + b, 0) / this.samples.length)
      : 0;
    return {
      startedAt: this.startedAt,
      endedAt,
      durationSeconds,
      peakViewers: this.peakViewers,
      avgViewers,
      totalViews: this.totalViews,
      totalLikes: this.likeTotal,
      totalComments: this.comments,
      totalShares: this.shares,
      newFollowers: this.follows,
    };
  }
}
