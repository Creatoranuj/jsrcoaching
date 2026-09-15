import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface StreamInfo { url: string; quality: string; type: string; container: string; }

// ─── Piped Instance Discovery + Health Cache ───
// Only 1 public Piped API instance survives as of March 2026
const PIPED_SEED_INSTANCES = [
  "api.piped.private.coffee",
];

// Invidious instances with api:false cannot serve API requests,
// but we try them with local=true anyway as some still respond
const INVIDIOUS_INSTANCES = [
  "inv.nadeko.net",
  "invidious.nerdvpn.de",
  "yewtu.be",
];

let healthyPipedInstances: string[] = [];
let lastInstanceRefresh = 0;
const INSTANCE_REFRESH_INTERVAL = 10 * 60 * 1000;

async function refreshInstances(): Promise<void> {
  if (Date.now() - lastInstanceRefresh < INSTANCE_REFRESH_INTERVAL && healthyPipedInstances.length > 0) return;
  
  console.log("[discovery] Refreshing instance lists...");
  lastInstanceRefresh = Date.now();

  // Try fetching dynamic Piped instance list from official API
  try {
    const res = await fetch("https://piped-instances.kavin.rocks/", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const apis = data
          .filter((d: any) => d.api_url && d.uptime_24h > 90)
          .sort((a: any, b: any) => (b.uptime_24h || 0) - (a.uptime_24h || 0))
          .map((d: any) => {
            try { return new URL(d.api_url).origin; } catch { return null; }
          })
          .filter(Boolean) as string[];
        if (apis.length > 0) {
          healthyPipedInstances = apis.slice(0, 6);
          console.log(`[discovery] Found ${apis.length} Piped instances, using ${healthyPipedInstances.length}: ${healthyPipedInstances.join(', ')}`);
          return;
        }
      }
    } else { await res.text(); }
  } catch (e) { console.log(`[discovery] Piped list fetch failed: ${(e as Error).message}`); }
  
  // Fallback to seed instances
  healthyPipedInstances = PIPED_SEED_INSTANCES.map(h => `https://${h}`);
}

// ─── YouTube Extraction Constants ───
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CONSENT_COOKIE = "SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjUwMzE5LjA1X3AwGgJlbiADGgYIgJnkvgY";
const YT_API_KEY = Deno.env.get("YT_API_KEY") ?? "";

const streamCache = new Map<string, { streams: StreamInfo[]; ts: number; source: string }>();
const CACHE_TTL = 8 * 60 * 1000;

// ─── Layer 1: Piped API (proxied URLs — best for playback) ───
async function extractViaPiped(videoId: string, signal: AbortSignal): Promise<{ streams: StreamInfo[]; source: string }> {
  const instances = healthyPipedInstances.length > 0 ? healthyPipedInstances : PIPED_SEED_INSTANCES.map(h => `https://${h}`);
  if (instances.length === 0) return { streams: [], source: "" };
  
  console.log(`[piped] Racing ${instances.length} instances: ${instances.join(', ')}`);

  const controllers: AbortController[] = [];
  
  const racePromises = instances.map(async (baseUrl) => {
    const ctrl = new AbortController();
    controllers.push(ctrl);
    const onAbort = () => ctrl.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      // baseUrl is full origin like "https://api.piped.private.coffee"
      const apiUrl = `${baseUrl}/streams/${videoId}`;
      console.log(`[piped] Fetching ${apiUrl}`);
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": BROWSER_UA, "Accept": "application/json" },
        signal: ctrl.signal,
      });

      if (!res.ok) { 
        const body = await res.text();
        throw new Error(`${baseUrl} returned ${res.status}: ${body.substring(0, 100)}`); 
      }
      const data = await res.json();
      const streams = parsePipedStreams(data);
      if (streams.length === 0) throw new Error(`${baseUrl}: 0 playable streams`);
      console.log(`[piped] ✓ ${baseUrl} → ${streams.length} streams`);
      return { streams, source: `piped:${baseUrl}` };
    } catch (e) {
      console.log(`[piped] ✗ ${baseUrl}: ${(e as Error).message}`);
      throw e;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  });

  try {
    const result = await Promise.any(racePromises);
    controllers.forEach(c => { try { c.abort(); } catch {} });
    return result;
  } catch {
    console.log("[piped] All instances failed");
    return { streams: [], source: "" };
  }
}

function parsePipedStreams(data: any): StreamInfo[] {
  const streams: StreamInfo[] = [];
  const videoStreams = data.videoStreams || [];
  for (const s of videoStreams) {
    if (!s.url) continue;
    const mime = s.mimeType || s.format || "";
    if (mime.startsWith("audio/")) continue;
    const hasAudio = s.videoOnly === false || s.videoOnly === undefined;
    const quality = s.quality || "unknown";
    const container = mime.includes("webm") ? "webm" : "mp4";
    streams.push({
      url: s.url,
      quality: `${quality}${hasAudio ? "" : " (video only)"}`,
      type: mime.split(";")[0] || "video/mp4",
      container,
    });
  }
  return streams;
}

// ─── Layer 2: Invidious API (local=true for proxied URLs) ───
async function extractViaInvidious(videoId: string, signal: AbortSignal): Promise<{ streams: StreamInfo[]; source: string }> {
  if (INVIDIOUS_INSTANCES.length === 0) return { streams: [], source: "" };
  
  console.log(`[invidious] Trying ${INVIDIOUS_INSTANCES.length} instances...`);

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const apiUrl = `https://${instance}/api/v1/videos/${videoId}?local=true`;
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": BROWSER_UA, "Accept": "application/json" },
        signal,
      });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      const streams = parseInvidiousStreams(data);
      if (streams.length > 0) {
        console.log(`[invidious] ✓ ${instance} → ${streams.length} streams`);
        return { streams, source: `invidious:${instance}` };
      }
    } catch (e) {
      console.log(`[invidious] ✗ ${instance}: ${(e as Error).message}`);
    }
  }
  console.log("[invidious] All instances failed");
  return { streams: [], source: "" };
}

function parseInvidiousStreams(data: any): StreamInfo[] {
  const streams: StreamInfo[] = [];
  for (const f of (data.formatStreams || [])) {
    if (!f.url) continue;
    const mime = (f.type || "").split(";")[0];
    if (mime.startsWith("audio/")) continue;
    streams.push({
      url: f.url,
      quality: f.qualityLabel || f.quality || "unknown",
      type: mime || "video/mp4",
      container: mime.includes("webm") ? "webm" : "mp4",
    });
  }
  for (const f of (data.adaptiveFormats || [])) {
    if (!f.url) continue;
    const mime = (f.type || "").split(";")[0];
    if (mime.startsWith("audio/")) continue;
    streams.push({
      url: f.url,
      quality: `${f.qualityLabel || f.quality || "unknown"} (video only)`,
      type: mime || "video/mp4",
      container: mime.includes("webm") ? "webm" : "mp4",
    });
  }
  return streams;
}

// ─── Layer 3: YouTube WEB client (current working approach March 2026) ───
async function extractViaWebClient(videoId: string, signal: AbortSignal): Promise<{ streams: StreamInfo[]; visitorData?: string }> {
  console.log("[web-client] Trying WEB client innertube");
  try {
    // First get visitor data and player.js URL from watch page
    const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`, {
      headers: { 
        "User-Agent": BROWSER_UA, 
        "Accept": "text/html,application/xhtml+xml", 
        "Accept-Language": "en-US,en;q=0.9", 
        "Cookie": CONSENT_COOKIE, 
        "Sec-Fetch-Dest": "document", 
        "Sec-Fetch-Mode": "navigate" 
      },
      signal,
    });
    if (!watchRes.ok) { await watchRes.text(); return { streams: [] }; }
    const html = await watchRes.text();

    // Extract visitor data
    const vd = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/)?.[1];
    
    // Extract ytInitialPlayerResponse
    let pr: any = null;
    const m1 = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|<\/script)/s);
    if (m1) try { pr = JSON.parse(m1[1]); } catch {}
    if (!pr) { 
      const m2 = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s); 
      if (m2) try { pr = JSON.parse(m2[1]); } catch { pr = safeParseTruncatedJson(m2[1]); } 
    }
    
    if (pr?.playabilityStatus?.status === "OK") {
      const streams = parseYTStreams(pr?.streamingData);
      if (streams.length > 0) {
        console.log(`[web-client] ✓ watchpage → ${streams.length} streams`);
        return { streams, visitorData: vd };
      }
    }
    
    // Try innertube WEB player API
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] || "2.20260320.01.00";
    
    const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_API_KEY}&prettyPrint=false`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "User-Agent": BROWSER_UA, 
        "X-YouTube-Client-Name": "1", 
        "X-YouTube-Client-Version": clientVersion,
        "Origin": "https://www.youtube.com", 
        "Referer": `https://www.youtube.com/watch?v=${videoId}`,
        ...(vd ? { "X-Goog-Visitor-Id": vd } : {}),
      },
      body: JSON.stringify({ 
        context: { 
          client: { 
            clientName: "WEB", 
            clientVersion, 
            hl: "en", 
            gl: "US",
            ...(vd ? { visitorData: vd } : {}),
          } 
        }, 
        videoId, 
        contentCheckOk: true, 
        racyCheckOk: true,
        playbackContext: {
          contentPlaybackContext: {
            signatureTimestamp: 20150,
          }
        }
      }),
      signal,
    });
    
    if (!playerRes.ok) { await playerRes.text(); return { streams: [], visitorData: vd }; }
    const playerData = await playerRes.json();
    
    if (playerData?.playabilityStatus?.status === "OK") {
      const streams = parseYTStreams(playerData?.streamingData);
      console.log(`[web-client] ✓ innertube WEB → ${streams.length} streams`);
      return { streams, visitorData: vd };
    }
    
    console.log(`[web-client] ✗ status: ${playerData?.playabilityStatus?.status}`);
    return { streams: [], visitorData: vd };
  } catch (e) { 
    console.log(`[web-client] error: ${(e as Error).message}`); 
    return { streams: [] }; 
  }
}

// ─── Layer 4: Mobile clients ───
async function extractViaMobile(videoId: string, visitorData?: string, signal?: AbortSignal): Promise<StreamInfo[]> {
  const clients = [
    { name: "ANDROID", version: "20.10.38", id: "3", ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US) gzip" },
    { name: "IOS", version: "20.10.4", id: "5", ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)" },
  ];
  for (const c of clients) {
    try {
      console.log(`[mobile] Trying ${c.name}`);
      const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": c.ua, "X-YouTube-Client-Name": c.id, "X-YouTube-Client-Version": c.version };
      if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_API_KEY}&prettyPrint=false`, {
        method: "POST", headers,
        body: JSON.stringify({ context: { client: { clientName: c.name, clientVersion: c.version, hl: "en", gl: "US", ...(visitorData ? { visitorData } : {}) } }, videoId, contentCheckOk: true, racyCheckOk: true }),
        signal,
      });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      if (data?.playabilityStatus?.status !== "OK") {
        console.log(`[mobile] ${c.name}: ${data?.playabilityStatus?.status}`);
        continue;
      }
      const streams = parseYTStreams(data?.streamingData);
      if (streams.length > 0) { console.log(`[mobile] ✓ ${c.name} ${streams.length} streams`); return streams; }
    } catch (e) { console.log(`[mobile] ${c.name}: ${(e as Error).message}`); }
  }
  return [];
}

function safeParseTruncatedJson(raw: string): any {
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') depth++; else if (raw[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(raw.substring(0, i + 1)); } catch { return null; } } }
  }
  return null;
}

function parseYTStreams(sd: any): StreamInfo[] {
  if (!sd) return [];
  const formats = [...(sd.formats || []), ...(sd.adaptiveFormats || [])];
  const streams: StreamInfo[] = [];
  for (const f of formats) {
    const url = f.url || (() => { const c = f.signatureCipher || f.cipher; if (!c) return null; try { return new URLSearchParams(c).get("url"); } catch { return null; } })();
    if (!url) continue;
    const mime = (f.mimeType || "").split(";")[0];
    if (mime.startsWith("audio/")) continue;
    const quality = f.qualityLabel || f.quality || "unknown";
    const hasAudio = !!(f.audioQuality || f.audioChannels);
    streams.push({ url, quality: `${quality}${hasAudio ? "" : " (video only)"}`, type: mime || "video/mp4", container: mime.includes("webm") ? "webm" : "mp4" });
  }
  return streams;
}

function sortStreams(s: StreamInfo[]): StreamInfo[] {
  return s.sort((a, b) => {
    const ac = a.quality.includes("video only") ? 0 : 1;
    const bc = b.quality.includes("video only") ? 0 : 1;
    if (ac !== bc) return bc - ac;
    return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
  });
}

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;


  try {
    const { videoId, lesson_id } = await req.json();
    if (!videoId || typeof videoId !== "string") {
      return new Response(JSON.stringify({ error: "videoId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!lesson_id || typeof lesson_id !== "string") {
      return new Response(JSON.stringify({ error: "lesson_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCESS GATE (fail-closed) ──
    // Mirror get-lesson-url: admin/teacher, OR active enrollment, OR free
    // course. Also verify the caller-supplied videoId actually belongs to
    // the caller-supplied lesson so a paid user cannot use their own gate
    // to extract a different (paid) lesson's stream.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lesson, error: lessonErr } = await serviceClient
      .from("lessons")
      .select("id, course_id, video_url")
      .eq("id", lesson_id)
      .maybeSingle();

    if (lessonErr || !lesson) {
      return new Response(JSON.stringify({ error: "Lesson not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // The lesson's video_url must contain the requested YouTube videoId
    // (accepts full URL or bare id). Reject mismatches to prevent using
    // one lesson's enrollment to extract a different video.
    if (!lesson.video_url || !String(lesson.video_url).includes(videoId)) {
      return new Response(JSON.stringify({ error: "videoId does not belong to lesson" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [roleRes, enrollmentRes, courseRes] = await Promise.all([
      serviceClient.from("user_roles").select("role").eq("user_id", auth.userId).in("role", ["admin", "teacher"]).maybeSingle(),
      serviceClient.from("enrollments").select("id").eq("user_id", auth.userId).eq("course_id", lesson.course_id).eq("status", "active").maybeSingle(),
      serviceClient.from("courses").select("price").eq("id", lesson.course_id).maybeSingle(),
    ]);
    const isStaff = !!roleRes.data;
    const isEnrolled = !!enrollmentRes.data;
    const price = Number((courseRes.data as { price?: number } | null)?.price ?? 0);
    const isFree = !price || price <= 0;
    if (!(isStaff || isEnrolled || isFree)) {
      return new Response(JSON.stringify({ error: "Purchase required to access this video" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[request] videoId=${videoId}`);

    const cached = streamCache.get(videoId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(JSON.stringify({ streams: cached.streams, source: `cache(${cached.source})` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Refresh instance health
    await refreshInstances();
    
    const signal = AbortSignal.timeout(14000);
    let streams: StreamInfo[] = [];
    let source = "";

    // ── Layer 1: Piped API (proxied URLs — actually playable by client) ──
    const pipedResult = await extractViaPiped(videoId, signal);
    if (pipedResult.streams.length > 0) {
      streams = pipedResult.streams;
      source = pipedResult.source;
    }

    // ── Layer 2: Invidious API ──
    if (streams.length === 0) {
      const invResult = await extractViaInvidious(videoId, signal);
      if (invResult.streams.length > 0) {
        streams = invResult.streams;
        source = invResult.source;
      }
    }

    // ── Layer 3: YouTube WEB client (watchpage + innertube) ──
    let visitorData: string | undefined;
    if (streams.length === 0) {
      const webResult = await extractViaWebClient(videoId, signal);
      visitorData = webResult.visitorData;
      if (webResult.streams.length > 0) {
        streams = webResult.streams;
        source = "web-client";
      }
    }

    // ── Layer 4: Mobile clients ──
    if (streams.length === 0) {
      streams = await extractViaMobile(videoId, visitorData, signal);
      if (streams.length > 0) source = "mobile";
    }

    if (streams.length === 0) {
      console.error("[result] ✗ All layers failed");
      return new Response(JSON.stringify({ error: "Stream extraction failed", details: "All extraction methods failed. Piped/Invidious instances may be down and YouTube is blocking direct extraction." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sorted = sortStreams(streams);
    streamCache.set(videoId, { streams: sorted, ts: Date.now(), source });
    if (streamCache.size > 100) { const now = Date.now(); for (const [k, v] of streamCache) { if (now - v.ts > CACHE_TTL) streamCache.delete(k); } }

    console.log(`[result] ✓ ${sorted.length} streams via ${source}`);
    return new Response(JSON.stringify({ streams: sorted, source }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
