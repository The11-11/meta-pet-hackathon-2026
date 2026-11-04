import { router } from 'expo-router';
import { useState } from 'react';
import { useCare } from '../CareContext';
import { ActionButton } from '../components/ui';
import { Field, FormNote, FormPage, FormTitle } from '../components/forms';
import { usePetNotifications } from '../PetNotificationContext';

export default function AppointmentRoute() {
  const { addAppointment } = useCare();
  const { enabled, nativeAvailable } = usePetNotifications();
  const [title, setTitle] = useState('Vet check-up');
  const [date, setDate] = useState(''); const [note, setNote] = useState(''); const [error, setError] = useState('');
  function save() {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date.trim())) { setError('Use the format YYYY-MM-DD HH:MM, for example 2026-10-30 09:30.'); return; }
    const parsed = new Date(date.trim().replace(' ', 'T'));
    const pieces = date.trim().split(/[- :]/).map(Number);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== pieces[0] || parsed.getMonth() + 1 !== pieces[1] || parsed.getDate() !== pieces[2] || parsed.getHours() !== pieces[3] || parsed.getMinutes() !== pieces[4]) { setError('Please enter a valid date and time.'); return; }
    addAppointment(title.trim(), parsed.toISOString(), note.trim()); router.back();
  }
  const reminderNote = !nativeAvailable ? 'Appointments are saved inside the app. This web preview does not send phone alerts or book with your vet.' : enabled
    ? 'Phone reminders aim for 15 minutes before future appointments, or the appointment time if it is closer. Your phone may delay or mute alerts. This does not book with your vet.'
    : 'Appointments are saved inside the app. Enable phone alerts in Settings for reminders. This does not book with your vet.';
  return <FormPage><FormTitle title="Keep the next visit in view." body="Save an appointment in your pet’s timeline." /><Field label="Appointment title" value={title} onChange={setTitle} maxLength={100} /><Field label="Date & time on this device" value={date} onChange={setDate} placeholder="2026-10-30 09:30" maxLength={16} /><Field label="Notes (optional)" value={note} onChange={setNote} multiline placeholder="Clinic, reason for visit, or questions to ask" />{!!error && <FormNote error>{error}</FormNote>}<FormNote>{reminderNote}</FormNote><ActionButton label="Save appointment" disabled={!title.trim() || !date.trim()} onPress={save} icon="calendar-outline" /></FormPage>;
}
