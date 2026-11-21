import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  ImageOff,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { LinkPreviewData, SharedLinkItem } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { soundFx } from '../utils/sound.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

interface SocialSiteStatus {
  publishedBaseUrl: string;
  shareUrlWithVersion: string;
  robotsTxtUrl: string;
  previewVersion: number;
  metadata: {
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    ogUrl: string;
    ogType: string;
    twitterCard: string;
    twitterTitle: string;
    twitterDescription: string;
    twitterImage: string;
  };
}

interface SocialAuditResult {
  targetMode: 'published' | 'local';
  targetUrl: string;
  reachable: boolean;
  httpStatus: number | null;
  blockedByAuthOrCookieGate: boolean;
  robotsAllowed: boolean | null;
  robotsStatus: number | null;
  imageReachable: boolean;
  imageStatus: number | null;
  imageContentType: string | null;
  meta: Record<string, string | null>;
  issues: string[];
}

interface LinkPreviewSectionProps {
  onShared?: () => void;
}

export function LinkPreviewSection({ onShared }: LinkPreviewSectionProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const presetLinks = [
    { label: 'GAMEVERSE Hub', url: `${origin}/` },
    { label: 'Tic-Tac-Toe', url: `${origin}/games/tictactoe` },
    { label: 'Rock-Paper-Scissors', url: `${origin}/games/rps` },
    { label: 'Guess the Number', url: `${origin}/games/guess_number` },
    { label: 'Leaderboard', url: `${origin}/leaderboard` },
  ];

  const [urlInput, setUrlInput] = useState(`${origin}/games/tictactoe`);
  const [noteInput, setNoteInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [imgBroken, setImgBroken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [sharedLinks, setSharedLinks] = useState<SharedLinkItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [siteStatus, setSiteStatus] = useState<SocialSiteStatus | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [verifyingTarget, setVerifyingTarget] = useState<'published' | 'local' | null>(null);
  const [auditResult, setAuditResult] = useState<SocialAuditResult | null>(null);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  async function loadSiteStatus() {
    try {
      const res = await apiFetch<SocialSiteStatus & { ok: boolean }>('/api/social-preview/status');
      setSiteStatus(res);
    } catch {
      // non-fatal
    }
  }

  async function loadSharedLinks() {
    setLoadingFeed(true);
    try {
      const res = await apiFetch<{ links: SharedLinkItem[] }>('/api/shared-links');
      setSharedLinks(res.links || []);
    } catch {
      // handled cleanly in UI
    } finally {
      setLoadingFeed(false);
    }
  }

  useEffect(() => {
    void loadSiteStatus();
    void loadSharedLinks();
    void handleGenerate(`${origin}/`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefreshPreviewCache() {
    setRefreshingCache(true);
    setCacheNotice(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        previewVersion: number;
        shareUrlWithVersion: string;
        message: string;
      }>('/api/social-preview/refresh', { method: 'POST' });
      setCacheNotice(res.message);
      soundFx.playWin();
      await loadSiteStatus();
    } catch (err) {
      setCacheNotice(err instanceof Error ? err.message : 'Could not refresh preview cache.');
    } finally {
      setRefreshingCache(false);
    }
  }

  async function handleVerifySitePreview(target: 'published' | 'local') {
    setVerifyingTarget(target);
    try {
      const res = await apiFetch<{ ok: boolean; audit: SocialAuditResult }>('/api/social-preview/verify', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      setAuditResult(res.audit);
      soundFx.playClick();
    } catch (err) {
      setCacheNotice(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifyingTarget(null);
    }
  }

  async function handleGenerate(targetUrl?: string) {
    const raw = (targetUrl ?? urlInput).trim();
    if (!raw) {
      setErrorMsg('Enter a valid http:// or https:// URL to generate a preview.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setPublishNotice(null);
    setImgBroken(false);

    try {
      const res = await apiFetch<{ ok: boolean; preview: LinkPreviewData }>(
        `/api/link-preview?url=${encodeURIComponent(raw)}`
      );
      setPreview(res.preview);
      soundFx.playClick();
    } catch (err) {
      setPreview(null);
      setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch metadata for that URL.');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setUrlInput('');
    setNoteInput('');
    setPreview(null);
    setErrorMsg(null);
    setPublishNotice(null);
    setImgBroken(false);
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(true);
      soundFx.playClick();
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      setErrorMsg('Clipboard access was denied by the browser. Copy the URL from the input box manually.');
    }
  }

  async function handlePublishToFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || preview.fallback) return;
    setPublishing(true);
    setErrorMsg(null);
    setPublishNotice(null);
    try {
      const res = await apiFetch<{ ok: boolean; sharedLink: SharedLinkItem }>('/api/shared-links', {
        method: 'POST',
        body: JSON.stringify({
          url: preview.finalUrl,
          note: noteInput.trim(),
        }),
      });
      setSharedLinks((prev) => [res.sharedLink, ...prev]);
      setNoteInput('');
      setPublishNotice('Link preview published to the GAMEVERSE shared feed.');
      soundFx.playWin();
      onShared?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to publish link.');
    } finally {
      setPublishing(false);
    }
  }

  const shareTargetUrl = preview?.finalUrl || urlInput.trim() || origin;
  const shareText = preview
    ? `${preview.title} — ${preview.description}`
    : 'Check out GAMEVERSE — Play. Compete. Earn. Conquer.';

  const shareChannels = [
    {
      name: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareTargetUrl}`)}`,
    },
    {
      name: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(shareTargetUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareTargetUrl)}`,
    },
    {
      name: 'X',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(
        shareTargetUrl
      )}`,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between border-b border-white/[0.08] pb-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#E11D48]">
            Open Graph & Social Card Inspector
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">
            Link Preview Studio
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Inspect live Open Graph and Twitter Card previews for any GAMEVERSE arena route or external website before sharing across WhatsApp, Telegram, Facebook, or X.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {presetLinks.map((preset) => (
            <button
              key={preset.url}
              type="button"
              onClick={() => {
                setUrlInput(preset.url);
                void handleGenerate(preset.url);
              }}
              className="rounded-lg border border-white/[0.1] bg-[#10141F] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[#E11D48]/60 hover:text-white cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Published GAMEVERSE Website Social Metadata & Cache Refresh Panel */}
      {siteStatus && (
        <div className="rounded-xl border border-white/[0.1] bg-[#10141F] p-6 space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Published Website Open Graph & Twitter/X Card
              </p>
              <h2 className="mt-1 font-display text-lg font-bold text-white">
                {siteStatus.metadata.ogTitle}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Canonical URL:{' '}
                <span className="font-mono text-slate-200">{siteStatus.metadata.ogUrl}</span> · Image Version{' '}
                <span className="font-mono text-[#F59E0B]">v={siteStatus.previewVersion}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={verifyingTarget !== null}
                onClick={() => void handleVerifySitePreview('published')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50 cursor-pointer"
              >
                {verifyingTarget === 'published' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
                Test Published URL
              </button>
              <button
                type="button"
                disabled={verifyingTarget !== null}
                onClick={() => void handleVerifySitePreview('local')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#0B0E17] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-white/25 disabled:opacity-50 cursor-pointer"
              >
                {verifyingTarget === 'local' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-[#F59E0B]" />
                )}
                Test Server HTML
              </button>
              <button
                type="button"
                disabled={refreshingCache}
                onClick={() => void handleRefreshPreviewCache()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
              >
                {refreshingCache ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh Preview Cache
              </button>
            </div>
          </div>

          {cacheNotice && (
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/25 px-3.5 py-2.5 text-xs text-emerald-200">
              {cacheNotice}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B0E17]">
              <img
                src={`/og-hero.jpg?v=${siteStatus.previewVersion}`}
                alt="GAMEVERSE Open Graph hero preview"
                className="aspect-[16/9] w-full object-cover border-b border-white/[0.08]"
              />
              <div className="p-3.5 space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#F59E0B]">
                  GAMEVERSE · {siteStatus.metadata.twitterCard}
                </p>
                <p className="font-display text-sm font-bold text-white">{siteStatus.metadata.ogTitle}</p>
                <p className="text-xs text-slate-400">{siteStatus.metadata.ogDescription}</p>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between space-y-3 rounded-xl border border-white/[0.08] bg-[#0B0E17] p-4 text-xs">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <span className="font-mono text-[10px] text-[#F59E0B]">og:image (HTTPS)</span>
                  <p className="mt-0.5 break-all text-slate-300">{siteStatus.metadata.ogImage}</p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-[#F59E0B]">Cache-Busted Share URL</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="truncate font-mono text-slate-200">{siteStatus.shareUrlWithVersion}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopy(siteStatus.shareUrlWithVersion)}
                      className="shrink-0 rounded border border-white/[0.15] px-2 py-0.5 text-[10px] font-semibold text-white hover:border-[#E11D48] cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                <span className="text-[11px] text-slate-400">Platform Debugger Tools:</span>
                <a
                  href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(siteStatus.shareUrlWithVersion)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-white/[0.1] bg-[#10141F] px-2.5 py-1 text-[11px] text-slate-200 hover:border-[#E11D48]"
                >
                  Facebook Scraper <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={`https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(siteStatus.shareUrlWithVersion)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-white/[0.1] bg-[#10141F] px-2.5 py-1 text-[11px] text-slate-200 hover:border-[#E11D48]"
                >
                  LinkedIn Inspector <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={`https://t.me/WebpageBot`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-white/[0.1] bg-[#10141F] px-2.5 py-1 text-[11px] text-slate-200 hover:border-[#E11D48]"
                >
                  Telegram @WebpageBot <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {auditResult && (
                <div className="rounded-lg border border-white/[0.08] bg-[#10141F] p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-white">
                      Audit: {auditResult.targetUrl}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        auditResult.reachable && auditResult.imageReachable && auditResult.robotsAllowed
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      HTML HTTP {auditResult.httpStatus ?? 'ERR'} · Image HTTP {auditResult.imageStatus ?? 'ERR'} · robots.txt{' '}
                      {auditResult.robotsAllowed ? 'ALLOW' : `HTTP ${auditResult.robotsStatus ?? 'ERR'}`}
                    </span>
                  </div>
                  {auditResult.issues.length > 0 ? (
                    <ul className="space-y-0.5 text-[11px] text-rose-300">
                      {auditResult.issues.map((issue) => (
                        <li key={issue}>• {issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-emerald-400">
                      All Open Graph, Twitter Card, robots.txt, and HTTPS og:image checks passed without crawler blocks!
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
            <label htmlFor="gv-preview-url" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Destination URL
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="gv-preview-url"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleGenerate();
                    }
                  }}
                  placeholder="https://example.com or http://localhost:3000/games/tictactoe"
                  className="w-full rounded-lg border border-white/[0.1] bg-[#07090F] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-slate-500 focus:border-[#E11D48] focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGenerate()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#BE123C] disabled:opacity-60 cursor-pointer"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Generate Preview
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#0B0E17] px-3.5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3.5 text-sm text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div>
                  <p className="font-medium">Preview generation failed</p>
                  <p className="mt-0.5 text-xs text-rose-300">{errorMsg}</p>
                </div>
              </div>
            )}

            {publishNotice && (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">
                {publishNotice}
              </div>
            )}

            <div className="mt-6">
              {loading && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#0B0E17] py-16 text-slate-400">
                  <Loader2 className="h-7 w-7 animate-spin text-[#E11D48]" />
                  <p className="mt-3 text-sm font-medium text-white">Fetching live metadata & thumbnail...</p>
                  <p className="mt-1 text-xs text-slate-500">Validating scheme, safety rules, Open Graph & Twitter tags</p>
                </div>
              )}

              {!loading && preview && (
                <div className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#0B0E17]">
                  <div className="relative aspect-[16/9] w-full bg-[#07090F] border-b border-white/[0.08] flex items-center justify-center overflow-hidden">
                    {preview.image && !imgBroken ? (
                      <img
                        src={preview.image}
                        alt={preview.title}
                        referrerPolicy="no-referrer"
                        onError={() => setImgBroken(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center px-6 text-center text-slate-400">
                        <ImageOff className="h-9 w-9 text-slate-500" />
                        <p className="mt-2 text-sm font-medium text-slate-300">
                          {preview.fallback ? 'Fallback preview card active' : 'No preview thumbnail provided by site'}
                        </p>
                        {preview.fallbackReason && (
                          <p className="mt-1 max-w-md text-xs text-slate-500">{preview.fallbackReason}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <div className="flex items-center gap-2 min-w-0">
                        {preview.favicon && (
                          <img
                            src={preview.favicon}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="h-4 w-4 rounded-sm object-contain"
                          />
                        )}
                        <span className="truncate font-mono uppercase tracking-wider text-[#F59E0B]">
                          {preview.siteName}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500">
                        {preview.fallback ? 'FALLBACK CARD' : 'VERIFIED OG META'}
                      </span>
                    </div>

                    <h2 className="font-display text-xl font-bold text-white leading-snug">
                      {preview.title}
                    </h2>
                    <p className="text-sm text-slate-300 leading-relaxed">{preview.description}</p>

                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08]">
                      <a
                        href={preview.finalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white truncate max-w-full"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{preview.finalUrl}</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => void handleCopy(preview.finalUrl)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#10141F] px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/25 cursor-pointer"
                      >
                        {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedUrl ? 'Copied' : 'Copy Link'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!loading && !preview && !errorMsg && (
                <div className="rounded-xl border border-dashed border-white/[0.12] bg-[#0B0E17] py-14 text-center text-sm text-slate-400">
                  Enter any link above or select a GAMEVERSE preset route to inspect its share card.
                </div>
              )}
            </div>

            {preview && (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Share to Social Platforms
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2.5">
                    {shareChannels.map((ch) => (
                      <a
                        key={ch.name}
                        href={ch.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#0B0E17] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#E11D48]/60 hover:text-white"
                      >
                        <Share2 className="h-3.5 w-3.5 text-[#E11D48]" />
                        {ch.name}
                      </a>
                    ))}
                  </div>
                </div>

                {!preview.fallback && (
                  <form onSubmit={handlePublishToFeed} className="border-t border-white/[0.08] pt-4">
                    <label htmlFor="gv-share-note" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Publish to GAMEVERSE Community Feed (Optional Note)
                    </label>
                    <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
                      <input
                        id="gv-share-note"
                        type="text"
                        maxLength={180}
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Challenge friends to beat your Tic-Tac-Toe streak..."
                        className="flex-1 rounded-lg border border-white/[0.1] bg-[#07090F] px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-[#E11D48] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={publishing}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-[#07090F] transition hover:bg-[#D97706] disabled:opacity-60 cursor-pointer"
                      >
                        {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Publish Link
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {preview?.metaTags && (
            <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
              <h3 className="font-display text-base font-semibold text-white">
                Extracted Open Graph & Twitter Metadata
              </h3>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                {[
                  ['og:title', preview.metaTags.ogTitle],
                  ['og:description', preview.metaTags.ogDescription],
                  ['og:image', preview.metaTags.ogImage],
                  ['og:type', preview.metaTags.ogType],
                  ['twitter:card', preview.metaTags.twitterCard],
                  ['twitter:title', preview.metaTags.twitterTitle],
                  ['twitter:image', preview.metaTags.twitterImage],
                ].map(([tag, val]) => (
                  <div key={tag} className="rounded-lg border border-white/[0.06] bg-[#0B0E17] p-3">
                    <dt className="font-mono text-[11px] text-[#F59E0B]">{tag}</dt>
                    <dd className="mt-1 break-all text-slate-300">{val || 'Not specified'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Shared Arena Links</h2>
                <p className="text-xs text-slate-400">Verified previews published by GAMEVERSE players</p>
              </div>
              <span className="font-mono text-xs text-slate-400 tabular-nums">{sharedLinks.length} saved</span>
            </div>

            {loadingFeed ? (
              <div className="py-12 text-center text-sm text-slate-400">Loading shared links...</div>
            ) : sharedLinks.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                No shared links yet. Generate a preview and publish the first arena card.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {sharedLinks.map((item) => (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B0E17] transition hover:border-white/20"
                  >
                    {item.imageUrl && (
                      <div className="aspect-[16/9] w-full overflow-hidden bg-[#07090F] border-b border-white/[0.06]">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar
                            username={item.username}
                            profilePictureUrl={item.profilePictureUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">{item.username}</p>
                            <p className="truncate font-mono text-[11px] text-slate-500">
                              {item.siteName || 'Web Link'}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-slate-500">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {item.note && <p className="text-xs italic text-slate-300">“{item.note}”</p>}

                      <div>
                        <h3 className="font-display text-sm font-bold text-white line-clamp-1">{item.title}</h3>
                        <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{item.description}</p>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setUrlInput(item.url);
                            void handleGenerate(item.url);
                          }}
                          className="text-xs font-semibold text-[#E11D48] hover:underline cursor-pointer"
                        >
                          Inspect Preview
                        </button>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
