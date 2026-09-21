import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy,
  updateDoc,
  deleteField,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { PollSchedule, PollScheduleTemplate } from '../types';

// Newest first — feeds the PollSchedules list screen.
export async function getPollSchedules(clubId: string): Promise<PollSchedule[]> {
  const q = query(collection(db, 'clubs', clubId, 'pollSchedules'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PollSchedule);
}

export async function getPollSchedule(clubId: string, scheduleId: string): Promise<PollSchedule | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'pollSchedules', scheduleId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PollSchedule) : null;
}

export interface PollScheduleFields {
  question: string;
  venue?: string;
  note?: string;
  minResponses?: number;
  createDayOfWeek: number;
  createHour: number;
  eventDaysOfWeek: number[];
  eventHour: number;
  eventMinute: number;
}

export async function createPollSchedule(
  params: PollScheduleFields & {
    clubId: string;
    createdBy: string;
    createdByName: string;
    template: PollScheduleTemplate;
  },
): Promise<string> {
  const scheduleRef = doc(collection(db, 'clubs', params.clubId, 'pollSchedules'));
  const now = Timestamp.now();
  await setDoc(scheduleRef, {
    id: scheduleRef.id,
    clubId: params.clubId,
    template: params.template,
    enabled: true,
    question: params.question,
    ...(params.venue ? { venue: params.venue } : {}),
    ...(params.note ? { note: params.note } : {}),
    ...(params.minResponses ? { minResponses: params.minResponses } : {}),
    createDayOfWeek: params.createDayOfWeek,
    createHour: params.createHour,
    eventDaysOfWeek: params.eventDaysOfWeek,
    eventHour: params.eventHour,
    eventMinute: params.eventMinute,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    createdAt: now,
    updatedAt: now,
  });
  return scheduleRef.id;
}

// Template is intentionally not editable here — switching it mid-life would
// require reshaping eventDaysOfWeek/options in a confusing way; the UI has
// the admin delete + recreate instead. venue/note/minResponses use
// deleteField() when cleared, since Firestore rejects a literal `undefined`.
export async function updatePollSchedule(
  clubId: string,
  scheduleId: string,
  fields: PollScheduleFields,
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'pollSchedules', scheduleId), {
    question: fields.question,
    venue: fields.venue ? fields.venue : deleteField(),
    note: fields.note ? fields.note : deleteField(),
    minResponses: fields.minResponses ? fields.minResponses : deleteField(),
    createDayOfWeek: fields.createDayOfWeek,
    createHour: fields.createHour,
    eventDaysOfWeek: fields.eventDaysOfWeek,
    eventHour: fields.eventHour,
    eventMinute: fields.eventMinute,
    updatedAt: Timestamp.now(),
  });
}

export async function setPollScheduleEnabled(clubId: string, scheduleId: string, enabled: boolean): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'pollSchedules', scheduleId), { enabled, updatedAt: Timestamp.now() });
}

// Deliberately does not touch any matchPolls docs this schedule previously
// created (lastCreatedPollId becomes a harmless dangling reference) — polls
// already posted stay exactly as they are.
export async function deletePollSchedule(clubId: string, scheduleId: string): Promise<void> {
  await deleteDoc(doc(db, 'clubs', clubId, 'pollSchedules', scheduleId));
}
