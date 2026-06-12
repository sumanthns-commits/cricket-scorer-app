import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { callCallableFunction } from './functionsClient';
import type { JoinRequest, Player, PublicPlayerStats } from '../types';

// Raise a request to join a club. Doc id = requester uid, so a member can only
// hold one open request per club (and re-requesting overwrites the old doc).
// Approval/rejection happens server-side via resolveJoinRequest.
export async function requestToJoin(
  clubId: string,
  user: { uid: string; displayName: string; photoURL?: string | null }
): Promise<void> {
  // Clear any stale (e.g. previously rejected) request first: the rules forbid
  // updates, so re-requesting must go through a fresh create. Deleting one's own
  // request is permitted, and a no-op if none exists.
  await deleteDoc(doc(db, 'clubs', clubId, 'joinRequests', user.uid));
  await setDoc(doc(db, 'clubs', clubId, 'joinRequests', user.uid), {
    uid: user.uid,
    displayName: user.displayName,
    photoURL: user.photoURL ?? null,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function getMyJoinRequest(
  clubId: string,
  uid: string
): Promise<JoinRequest | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'joinRequests', uid));
  return snap.exists() ? (snap.data() as JoinRequest) : null;
}

export async function cancelJoinRequest(clubId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'clubs', clubId, 'joinRequests', uid));
}

// Admin-only at the security layer (joinRequests read: if isAdmin). Lists
// pending requests; resolved ones drop out of the list.
export async function listPendingJoinRequests(clubId: string): Promise<JoinRequest[]> {
  const q = query(
    collection(db, 'clubs', clubId, 'joinRequests'),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as JoinRequest);
}

export async function resolveJoinRequest(
  clubId: string,
  requesterUid: string,
  decision: 'approve' | 'reject',
  linkGhostId?: string
): Promise<void> {
  await callCallableFunction('resolveJoinRequest', {
    clubId,
    requesterUid,
    decision,
    ...(linkGhostId ? { linkGhostId } : {}),
  });
}

// Unlinked ghost players in a club, for the approval-time link picker. Excludes
// already-linked ghosts (type:'linked').
export async function getClubGhosts(clubId: string): Promise<Player[]> {
  const q = query(
    collection(db, 'clubs', clubId, 'players'),
    where('type', '==', 'ghost')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Player);
}

export async function unlinkGhost(clubId: string, memberUid: string): Promise<void> {
  await callCallableFunction('unlinkGhost', { clubId, memberUid });
}

// A player's per-club stats across every club they belong to, read from the
// public mirror (publicPlayerStats). Used by the admin's request review screen.
export async function getPublicPlayerStats(uid: string): Promise<PublicPlayerStats[]> {
  const q = query(collection(db, 'publicPlayerStats'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as PublicPlayerStats);
}
