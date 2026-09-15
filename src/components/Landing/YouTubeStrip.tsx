import { useState, memo } from "react";
import { Play, Youtube } from "lucide-react";
import { Button } from "../ui/button";
import { tapHaptic } from "@/lib/native/haptics";

export const YOUTUBE_CHANNEL_URL =
  "https://www.youtube.com/channel/UCJig1qwQQN3doNzobNDlB_A";

type Video = { id: string; title: string };

const VIDEOS: Video[] = [
  {
    id: "iWHYZpM1FDo",
    title:
      "Class 9th | Chapter 4.1 complete exercise | दो चरों वाला रैखिक समीकरण | UP Board NCERT",
  },
  {
    id: "fUlRFQRvv_k",
    title:
      "द्विघात समीकरण Exercise 4.2 Question 4 | Class 10 Maths Chapter 4 | NCERT Hindi",
  },
  {
    id: "bVm4XnD7QP4",
    title:
      "सांतत्य तथा अवकलनीयता (Introduction) | Class 12 Maths Chapter 5 | NCERT Hindi",
  },
];

const VideoCard = memo(({ video }: { video: Video }) => {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative aspect-video w-full bg-muted">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
            title={video.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            aria-label={`Play video: ${video.title}`}
            onClick={() => {
              void tapHaptic("light");
              setPlaying(true);
            }}
            className="absolute inset-0 h-full w-full"
          >
            <img
              src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
              alt={video.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/35" />
            <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 group-active:scale-95">
              <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {video.title}
        </h3>
      </div>
    </div>
  );
});
VideoCard.displayName = "VideoCard";

const YouTubeStrip = () => (
  <section
    id="youtube"
    aria-label="Latest videos from our YouTube channel"
    className="py-14 md:py-20"
  >
    <div className="mx-auto max-w-6xl px-4">
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          <Youtube className="h-3.5 w-3.5" aria-hidden="true" />
          YouTube
        </span>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Latest from our YouTube channel
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Free lessons from Study by R C Sir — watch right here, no app switch needed.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {VIDEOS.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <a
          href={YOUTUBE_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => { void tapHaptic("light"); }}
        >
          <Button variant="outline" className="h-11 rounded-md px-6">
            <Youtube className="mr-2 h-4 w-4" aria-hidden="true" />
            Watch more on YouTube
          </Button>
        </a>
      </div>
    </div>
  </section>
);

export default YouTubeStrip;
