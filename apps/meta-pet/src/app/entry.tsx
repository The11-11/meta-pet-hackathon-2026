import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useCare } from '../CareContext';
import { ActionButton } from '../components/ui';
import { Field, FormNote, FormPage, FormTitle } from '../components/forms';
import { careLabels } from '../theme';
import type { CareKind } from '../types';

export default function EntryRoute() {
  const { kind: rawKind } = useLocalSearchParams<{ kind?: string }>();
  const kind: CareKind = rawKind && Object.hasOwn(careLabels, rawKind) ? rawKind as CareKind : 'feeding';
  const { data, addLog } = useCare();
  const [label, setLabel] = useState<string>(careLabels[kind]);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  return <FormPage><FormTitle title={`Record ${careLabels[kind].toLowerCase()}`} body={`A small update helps keep ${data.pet.name}’s care timeline useful.`} /><Field label="Entry title" value={label} onChange={setLabel} maxLength={80} /><Field label="Your observations (optional)" value={note} onChange={setNote} multiline placeholder="What happened? Anything you’d like to remember?" /><FormNote>This records an owner observation with the current time. It does not verify a meal, measure sleep, or read a connected device.</FormNote>{kind === 'training' ? <ActionButton label="Find local dog trainers" icon="school-outline" tone="violet" onPress={() => router.push('/trainers')} /> : null}<ActionButton label="Save care entry" icon="checkmark" disabled={!label.trim() || saved} onPress={() => { if (saved) return; setSaved(true); addLog(kind, label, note); router.back(); }} /></FormPage>;
}
