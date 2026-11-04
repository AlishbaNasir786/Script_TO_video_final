This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Subtitles

Burned-in subtitles are timed from each generated clip's own audio, not estimated:

1. Each 15s clip's audio is aligned against the lines that clip speaks (ElevenLabs Forced Alignment), giving the real start/end of every word.
2. Each line is verified (alignment confidence + ffmpeg speech detection). Lines the video model skipped or reworded fall back to speech-to-text word timestamps.
3. If a clip's audio can't be measured at all (no key, API down, no audio track), that clip falls back to a word-count estimate. Subtitle problems never fail a video.

Set `ELEVENLABS_API_KEY` in `.env.local`. The key only needs the **Forced Alignment** and **Speech to Text** permissions; no speech is synthesized. Cost is billed per second of audio (about 45s per video).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
