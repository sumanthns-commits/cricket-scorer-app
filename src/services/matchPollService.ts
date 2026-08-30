import { Platform, Share } from 'react-native';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  arrayUnion,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { MatchPoll, PollOption, PollResponse } from '../types';

export const POLL_HOSTING_DOMAIN = 'crease-24487.web.app';

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

// A short, tidy id instead of Firestore's ~20-char auto-id — the poll id
// ends up visible in the shared link, so keeping it short matters for how
// that link reads in a WhatsApp message. Collision odds across one club's
// poll history are negligible at this length; no retry-on-exists needed.
function generateShortPollId(): string {
  let id = '';
  for (let i = 0; i < 8; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return id;
}

type SharablePoll = {
  clubId: string;
  id: string;
  question: string;
  multiSelect: boolean;
  options: { label: string }[];
};

// Shared by CreateMatchPoll (first share), PollResponse's plain-text share,
// and its image-snapshot share, so the wording never drifts apart. `*text*`/
// `_line_` use WhatsApp's own lightweight markdown so the question renders bold.
export function buildPollShareContent(poll: SharablePoll): { message: string; url: string } {
  const url = `https://${POLL_HOSTING_DOMAIN}/poll/${poll.clubId}/${poll.id}`;
  const optionsLine = poll.multiSelect ? `_${poll.options.map((o) => o.label).join(' / ')}?_\n` : '';
  const message = `🏏 *${poll.question}*\n${optionsLine}Tap to say if you're in 👇`;
  return { message, url };
}

// Plain text+link share (no image) — used right after creating a poll, when
// there are no responses yet to put in a snapshot.
//
// iOS's Share API takes `message` and `url` as separate items — passed that
// way, WhatsApp shows the question as clean caption text and unfurls the
// link into its own preview card underneath, instead of the raw URL sitting
// inline in the message. Android's Share API has no separate `url` field
// (a React Native/OS limitation, not something this app can route around),
// so the link has to be part of the message text there — WhatsApp still
// auto-generates a preview card underneath it from that same link, it's
// just also visible as blue link text above the card.
export async function sharePoll(poll: SharablePoll): Promise<void> {
  const { message, url } = buildPollShareContent(poll);
  await Share.share(Platform.OS === 'ios' ? { message, url } : { message: `${message}\n${url}` });
}

// Newest first — feeds the MatchPolls list screen. Only the poll docs
// themselves (not response subcollections), so this stays a single read per
// poll regardless of how many members have responded. Expired polls (every
// candidate date already passed) are filtered out client-side rather than
// via a Firestore `where` — avoids needing a composite index alongside the
// createdAt ordering, and the actual data cleanup happens separately via the
// cleanupExpiredPolls scheduled Cloud Function.
export async function getClubPolls(clubId: string): Promise<MatchPoll[]> {
  const q = query(collection(db, 'clubs', clubId, 'matchPolls'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const now = Date.now();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as MatchPoll)
    // Missing expiresAt (a poll created before this field existed) never
    // filters out — a crash here would fail the whole list, not just that
    // one poll, since this runs as a single array pass over every doc.
    .filter((poll) => !poll.expiresAt || poll.expiresAt.toMillis() > now);
}

export async function createMatchPoll(params: {
  clubId: string;
  createdBy: string;
  createdByName: string;
  question: string;
  multiSelect: boolean;
  options: { id: string; label: string; proposedDate?: Date; schedulable: boolean; minResponses?: number }[];
  venue?: string;
  note?: string;
}): Promise<string> {
  const pollRef = doc(db, 'clubs', params.clubId, 'matchPolls', generateShortPollId());
  const pollId = pollRef.id;
  const options: PollOption[] = params.options.map((o) => ({
    id: o.id,
    label: o.label,
    schedulable: o.schedulable,
    ...(o.proposedDate ? { proposedDate: Timestamp.fromDate(o.proposedDate) } : {}),
    ...(o.minResponses ? { minResponses: o.minResponses } : {}),
  }));
  // Every poll template always carries at least one dated option (the "Yes"
  // option for a simple poll, every row for a multi-date poll), so this max
  // is always well-defined. Expiry is a day AFTER the latest match date, not
  // at the match itself — admins may still want to schedule/reference the
  // poll right up to (and slightly past) the day it's for.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const latestMatchDateMs = Math.max(...params.options.map((o) => o.proposedDate?.getTime() ?? 0));
  const expiresAtMs = latestMatchDateMs + ONE_DAY_MS;
  const createdAt = Timestamp.now();
  await setDoc(pollRef, {
    id: pollId,
    clubId: params.clubId,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    question: params.question,
    multiSelect: params.multiSelect,
    options,
    ...(params.venue ? { venue: params.venue } : {}),
    ...(params.note ? { note: params.note } : {}),
    convertedMatches: [],
    createdAt,
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    lastReminderCheckAt: createdAt,
    optionThresholdMet: {},
  });
  return pollId;
}

export async function getMatchPoll(clubId: string, pollId: string): Promise<MatchPoll | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'matchPolls', pollId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as MatchPoll) : null;
}

// Live-updates the poll doc itself — picks up new convertedMatches entries as
// an admin schedules matches off it, without the viewer needing to reopen.
export function subscribeMatchPoll(
  clubId: string,
  pollId: string,
  onData: (poll: MatchPoll | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'clubs', clubId, 'matchPolls', pollId),
    (snap) => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as MatchPoll) : null),
    onError,
  );
}

// Live per-member response list — feeds the results screen's per-option
// counts/names and the squad the admin sees before converting.
export function subscribeMatchPollResponses(
  clubId: string,
  pollId: string,
  onData: (responses: PollResponse[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db, 'clubs', clubId, 'matchPolls', pollId, 'responses'),
    (snap) => onData(snap.docs.map((d) => d.data() as PollResponse)),
    onError,
  );
}

export async function getMyPollResponse(
  clubId: string,
  pollId: string,
  uid: string,
): Promise<PollResponse | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'matchPolls', pollId, 'responses', uid));
  return snap.exists() ? (snap.data() as PollResponse) : null;
}

// Doc id = responder's own uid (one response per member); re-tap overwrites,
// so changing your mind is just calling this again with a different selection.
export async function respondToPoll(
  clubId: string,
  pollId: string,
  user: { uid: string; displayName: string },
  optionIds: string[],
): Promise<void> {
  await setDoc(doc(db, 'clubs', clubId, 'matchPolls', pollId, 'responses', user.uid), {
    uid: user.uid,
    displayName: user.displayName,
    optionIds,
    respondedAt: Timestamp.now(),
  });
}

// Admin-only manual delete. Firestore doesn't cascade-delete subcollections,
// so the responses docs are cleared first (batched — same chunking as
// matchService.deleteMatch, defensively, though a poll's response count is
// realistically nowhere near the 500-op batch cap).
export async function deletePoll(clubId: string, pollId: string): Promise<void> {
  const pollRef = doc(db, 'clubs', clubId, 'matchPolls', pollId);
  const responsesSnap = await getDocs(collection(pollRef, 'responses'));

  const refs = responsesSnap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 499) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + 499)) batch.delete(ref);
    await batch.commit();
  }

  await deleteDoc(pollRef);
}

// Records that a schedulable option has been turned into a real match, so the
// results screen can hide that option's "Schedule" button and link to the
// match instead. Called from TeamBuilder's draft-mode confirm handler right
// after createMatch() succeeds — fire-and-forget, same best-effort style as
// this codebase's push-notification sends never blocking the main write.
export async function markPollOptionConverted(
  clubId: string,
  pollId: string,
  optionId: string,
  matchId: string,
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matchPolls', pollId), {
    convertedMatches: arrayUnion({ matchId, optionId, convertedAt: Timestamp.now() }),
  });
}
