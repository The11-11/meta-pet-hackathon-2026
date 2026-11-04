import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useAuth } from '../AuthContext';
import { AUTH_BASE_URL } from '../auth-client';
import { useCare } from '../CareContext';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import {
  cancelWhatsAppReminder, disconnectWhatsApp, futureSastWalkTime, getWhatsAppConfig, getWhatsAppStatus,
  pairWhatsApp, scheduleWhatsAppReminder, validatedWhatsAppPairingLink, whatsAppReminderKey, whatsAppReminderLabels,
  type WhatsAppConfig, type WhatsAppPairing, type WhatsAppReminder, type WhatsAppScheduleInput, type WhatsAppSession, type WhatsAppStatus,
} from '../whatsappClient';
import { Field, FormNote } from './forms';
import { ActionButton, Icon } from './ui';

function careTime(value: string) {
  return `${new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))} SAST`;
}

export function WhatsAppSettings() {
  const { owner } = useAuth(); const { data } = useCare();
  // Account and pet changes remount the panel before an old pairing or reminder can be displayed.
  return <WhatsAppOwnerSettings key={`${owner?.mode}:${owner?.id}:${data.pet.id}`} />;
}

function WhatsAppOwnerSettings() {
  const { owner, getMuseTransport } = useAuth(); const { data } = useCare(); const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [pairing, setPairing] = useState<(WhatsAppPairing & { appointmentAlerts: boolean; walkAlerts: boolean }) | null>(null);
  const [appointmentAlerts, setAppointmentAlerts] = useState(false);
  const [walkAlerts, setWalkAlerts] = useState(false);
  const [consent, setConsent] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState('');
  const [walkTime, setWalkTime] = useState('');
  const [leadMinutes, setLeadMinutes] = useState<0 | 15>(15);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const alive = useRef(true); const revision = useRef(0); const inFlight = useRef<AbortController | null>(null);
  const facebook = owner?.mode === 'facebook'; const ownerId = facebook ? owner.id : '';

  const run = useCallback(async <T,>(task: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void) => {
    if (!alive.current || inFlight.current) return;
    const controller = new AbortController(); inFlight.current = controller;
    const operation = ++revision.current; setBusy(true); setError(''); setMessage('');
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let removeAbortListener = () => {};
    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(new Error('WhatsApp request was cancelled.'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => controller.signal.removeEventListener('abort', onAbort);
      });
      const result = await Promise.race([task(controller.signal), cancelled]);
      if (alive.current && revision.current === operation && !controller.signal.aborted) apply(result);
    } catch (failure) {
      if (alive.current && revision.current === operation) setError(controller.signal.aborted
        ? 'The WhatsApp check timed out. Refresh its status before trying again.'
        : failure instanceof Error ? failure.message : 'WhatsApp could not complete this request.');
    } finally {
      clearTimeout(timeout); removeAbortListener();
      if (inFlight.current === controller) inFlight.current = null;
      if (alive.current && revision.current === operation) setBusy(false);
    }
  }, []);

  const session = useCallback(async (signal: AbortSignal): Promise<WhatsAppSession> => {
    if (!ownerId) throw new Error('Sign in with Facebook to manage WhatsApp alerts.');
    const transport = await getMuseTransport(AUTH_BASE_URL);
    if (signal.aborted) throw new Error('The WhatsApp request was cancelled.');
    return { ownerId, transport };
  }, [getMuseTransport, ownerId]);

  const refresh = useCallback(() => run(async signal => {
    if (!ownerId) return { config: await getWhatsAppConfig(AUTH_BASE_URL, signal), status: null };
    const next = await getWhatsAppStatus(AUTH_BASE_URL, await session(signal), signal);
    return { config: next, status: next };
  }, next => {
    setConfig(next.config); setStatus(next.status); setClock(Date.now());
    if (!next.status?.pendingPairing) setPairing(null);
    else setPairing(current => current?.expiresAt === next.status?.pendingPairing?.expiresAt ? current : null);
    setMessage(next.status?.connected ? 'WhatsApp connection refreshed. Check each reminder’s delivery status below.' : 'WhatsApp is not connected.');
  }), [ownerId, run, session]);

  useEffect(() => {
    alive.current = true; void refresh();
    return () => { alive.current = false; inFlight.current?.abort(); inFlight.current = null; };
  }, [refresh]);

  useEffect(() => {
    if (!pairing) return;
    const timeout = setTimeout(() => { setPairing(null); setMessage('The connection link expired. Create a new link to continue.'); }, Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => clearTimeout(timeout);
  }, [pairing]);

  function preparePairing() {
    if (!config?.available || !consent || (!appointmentAlerts && !walkAlerts)) return;
    void run(async signal => pairWhatsApp(AUTH_BASE_URL, await session(signal), { appointmentAlerts, walkAlerts }, signal), next => {
      setPairing({ ...next, appointmentAlerts, walkAlerts }); setConsent(false);
      setMessage('Link prepared. Open WhatsApp and send the prefilled START message yourself, then return and refresh. Your choice is saved only after that message is verified.');
    });
  }

  function openPairing() {
    if (!pairing || Date.parse(pairing.expiresAt) <= Date.now()) { setPairing(null); setError('Create a new connection link; this one has expired.'); return; }
    let link: string; try { link = validatedWhatsAppPairingLink(pairing.link); } catch { setPairing(null); setError('This connection link is invalid. Create a new one.'); return; }
    // Called directly by a user press; generating a link never opens WhatsApp or sends a message.
    void run(async () => Linking.openURL(link), () => setMessage('Send the prefilled START message in WhatsApp. Return here and choose Refresh WhatsApp status.'));
  }

  function rememberReminder(reminder: WhatsAppReminder) {
    setStatus(current => current ? { ...current, reminders: [reminder, ...current.reminders.filter(item => item.id !== reminder.id)].slice(0, 50) } : current);
  }

  function schedule(input: WhatsAppScheduleInput) {
    if (!config?.available || !status?.connected || !status.preferences[input.kind === 'walk' ? 'walkAlerts' : 'appointmentAlerts']) return;
    void run(async signal => scheduleWhatsAppReminder(AUTH_BASE_URL, await session(signal), input, signal), result => {
      rememberReminder(result.reminder);
      setMessage(result.reused ? `This alert already exists. ${whatsAppReminderLabels[result.reminder.state]}.`
        : result.scheduled ? 'WhatsApp alert queued. This does not confirm delivery; check its status below.' : `Alert status: ${whatsAppReminderLabels[result.reminder.state]}.`);
    });
  }

  function scheduleAppointment() {
    const appointment = data.appointments.find(item => item.id === selectedAppointment);
    if (!appointment || Date.parse(appointment.date) <= Date.now()) { setError('Choose a future saved appointment.'); return; }
    schedule({ petId: data.pet.id, petName: data.pet.name, kind: 'appointment', eventAt: appointment.date, leadMinutes, timeZone: 'Africa/Johannesburg',
      clientReminderId: whatsAppReminderKey('appointment', [data.pet.id, appointment.id, appointment.date, String(leadMinutes)]) });
  }

  function scheduleWalk() {
    const eventAt = futureSastWalkTime(walkTime);
    if (!eventAt) { setError('Enter a future walk time in SAST using YYYY-MM-DD HH:MM.'); return; }
    schedule({ petId: data.pet.id, petName: data.pet.name, kind: 'walk', eventAt, leadMinutes, timeZone: 'Africa/Johannesburg',
      clientReminderId: whatsAppReminderKey('walk', [data.pet.id, eventAt, String(leadMinutes)]) });
  }

  function cancel(reminder: WhatsAppReminder) {
    void run(async signal => cancelWhatsAppReminder(AUTH_BASE_URL, await session(signal), reminder.id, signal), next => {
      rememberReminder(next); setMessage(`Alert status: ${whatsAppReminderLabels[next.state]}.`);
    });
  }

  function disconnect() {
    void run(async signal => disconnectWhatsApp(AUTH_BASE_URL, await session(signal), signal), result => {
      setPairing(null); setConsent(false); setAppointmentAlerts(false); setWalkAlerts(false);
      setStatus(current => current ? { ...current, connected: false, recipientLabel: null, preferences: { appointmentAlerts: false, walkAlerts: false }, pendingPairing: null,
        reminders: current.reminders.map(item => item.state === 'scheduled' ? { ...item, state: 'cancelled' } : item) } : current);
      setMessage(`WhatsApp disconnected. ${result.cancelledQueued} queued alert${result.cancelledQueued === 1 ? '' : 's'} cancelled. A message already being sent may still arrive.`);
    });
  }

  const futureAppointments = data.appointments.filter(item => Number.isFinite(Date.parse(item.date)) && Date.parse(item.date) > clock);
  const appointment = futureAppointments.find(item => item.id === selectedAppointment);
  const walkAt = futureSastWalkTime(walkTime, clock);
  const ready = Boolean(config?.available && status?.connected);
  const reminders = status?.reminders.filter(item => item.petId === data.pet.id) ?? [];

  function choice(label: string, checked: boolean, onPress: () => void, role: 'checkbox' | 'radio' = 'checkbox', key = label) {
    return <Pressable key={key} accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={onPress}
      style={({ pressed }) => [styles.choice, checked && styles.selected, busy && styles.disabled, pressed && styles.pressed]}>
      <Icon name={role === 'radio' ? (checked ? 'radio-button-on' : 'radio-button-off') : (checked ? 'checkbox-outline' : 'square-outline')} color={checked ? colors.blue : colors.slate} size={21} />
      <Text style={styles.choiceLabel}>{label}</Text>
    </Pressable>;
  }

  return <View style={styles.section}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>WHATSAPP PET ALERTS</Text>
      <Text accessibilityRole="header" style={styles.title}>A reminder where you’ll see it.</Text>
      <Text style={styles.body}>Choose appointment or planned-walk alerts for {data.pet.name || 'your pet'}. Each alert needs your review; saving care in Meta Pet does not send WhatsApp messages automatically.</Text>
    </View>
    <Text style={styles.status}>{status?.connected ? `Connected to ${status.recipientLabel}` : 'Not connected'}</Text>
    {!config ? <FormNote>{busy ? 'Checking WhatsApp availability…' : 'WhatsApp availability has not been confirmed.'}</FormNote>
      : !config.available ? <FormNote>{config.status === 'disabled' ? 'WhatsApp alerts are switched off on this server.' : 'The WhatsApp Business connection still needs server setup.'} No WhatsApp alerts can be scheduled yet.</FormNote>
        : <FormNote>Server setup is available. A verified WhatsApp connection and approved message templates are still required; availability does not prove delivery.</FormNote>}
    {!facebook && <FormNote>Sign in with Facebook to connect WhatsApp alerts to your own care account. The demo does not connect a phone number.</FormNote>}
    {facebook && config?.available && <>
      {status?.connected && <Text style={styles.caption}>Confirmed choices: {status.preferences.appointmentAlerts ? 'appointment alerts' : 'no appointment alerts'}; {status.preferences.walkAlerts ? 'walk alerts' : 'no walk alerts'}. Changing the choices below requires sending a new START message.</Text>}
      <Text accessibilityRole="header" style={styles.subtitle}>{status?.connected ? 'Choose an updated opt-in' : 'Choose your alerts'}</Text>
      {choice('Appointment alerts', appointmentAlerts, () => setAppointmentAlerts(value => !value))}
      {choice('Planned-walk alerts', walkAlerts, () => setWalkAlerts(value => !value))}
      {choice('I agree to receive these selected pet-care alerts through WhatsApp. I can disconnect here or send STOP in WhatsApp.', consent, () => setConsent(value => !value))}
      <ActionButton label={status?.connected ? 'Prepare updated connection link' : 'Prepare WhatsApp connection link'} icon="link-outline"
        disabled={busy || !consent || (!appointmentAlerts && !walkAlerts)} onPress={preparePairing} />
      {pairing && <View style={styles.review}>
        <Text style={styles.subtitle}>Send START to confirm</Text>
        <Text style={styles.choiceLabel}>This link requests: {[pairing.appointmentAlerts ? 'appointment alerts' : '', pairing.walkAlerts ? 'planned-walk alerts' : ''].filter(Boolean).join(' and ')}.</Text>
        <Text style={styles.body}>This private, one-use link expires at {careTime(pairing.expiresAt)}. Opening it prepares a message; you must press Send in WhatsApp. No message has been sent by Meta Pet.</Text>
        <ActionButton label="Open WhatsApp to send START" tone="navy" icon="open-outline" disabled={busy} onPress={openPairing} />
      </View>}
      {!pairing && status?.pendingPairing && <FormNote>A connection request is waiting until {careTime(status.pendingPairing.expiresAt)}. If you no longer have its link, prepare a new one.</FormNote>}
    </>}
    <ActionButton label={busy ? 'Working…' : 'Refresh WhatsApp status'} tone="navy" icon="refresh-outline" disabled={busy} onPress={() => void refresh()} />
    {ready && <>
      <Text accessibilityRole="header" style={styles.subtitle}>When should the alert arrive?</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="WhatsApp alert timing" style={styles.heading}>
        {choice('Aim for 15 minutes before', leadMinutes === 15, () => setLeadMinutes(15), 'radio')}
        {choice('At the planned time', leadMinutes === 0, () => setLeadMinutes(0), 'radio')}
      </View>
      <Text style={styles.caption}>Times below use Africa/Johannesburg (SAST). If fewer than 15 minutes remain, the alert is queued for the planned time. Delivery can be delayed.</Text>
      <Text accessibilityRole="header" style={styles.subtitle}>Choose a saved appointment</Text>
      {!status?.preferences.appointmentAlerts ? <FormNote>Appointment alerts need their own confirmed opt-in above.</FormNote> : <>
        {!futureAppointments.length && <FormNote>Save a future appointment in Care first, then choose it here. This does not book with a vet.</FormNote>}
        <View accessibilityRole="radiogroup" accessibilityLabel="Choose a saved appointment for WhatsApp" style={styles.heading}>
          {futureAppointments.map(item => choice(`${item.title} · ${careTime(item.date)}`, selectedAppointment === item.id, () => setSelectedAppointment(item.id), 'radio', item.id))}
        </View>
        {appointment && <View style={styles.review}>
          <Text style={styles.body}>Review: appointment alert for {data.pet.name}, {careTime(appointment.date)}. Only the pet name, alert type and time are shared for this alert; your appointment title and notes stay out of the message request.</Text>
          <ActionButton label="Schedule this appointment alert" icon="calendar-outline" disabled={busy} onPress={scheduleAppointment} />
        </View>}
      </>}
      <Text accessibilityRole="header" style={styles.subtitle}>Plan a walk alert</Text>
      {!status?.preferences.walkAlerts ? <FormNote>Planned-walk alerts need their own confirmed opt-in above.</FormNote> : <>
        <Field label="Future walk time in SAST" value={walkTime} onChange={value => { if (!inFlight.current) setWalkTime(value); }} maxLength={16} placeholder="YYYY-MM-DD HH:MM" />
        {!!walkTime && !walkAt && <FormNote>Use a valid future time in SAST, for example YYYY-MM-DD HH:MM.</FormNote>}
        {walkAt && <View style={styles.review}>
          <Text style={styles.body}>Review: planned-walk alert for {data.pet.name}, {careTime(walkAt)}. Scheduling an alert does not record a walk or add a care entry.</Text>
          <ActionButton label="Schedule this planned-walk alert" icon="paw-outline" disabled={busy} onPress={scheduleWalk} />
        </View>}
      </>}
    </>}
    {!!reminders.length && <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.subtitle}>This pet’s WhatsApp alerts</Text>
      {reminders.map(item => <View key={item.id} style={styles.review}>
        <Text style={styles.choiceLabel}>{item.kind === 'walk' ? 'Planned walk' : 'Appointment'} · {careTime(item.eventAt)}</Text>
        <Text style={styles.body}>{whatsAppReminderLabels[item.state]}</Text>
        <Text style={styles.caption}>Sending time: {careTime(item.scheduledFor)}{item.errorCode ? '. The service reported a problem; refresh before taking further action.' : ''}</Text>
        {item.state === 'scheduled' && <ActionButton label="Cancel this queued alert" tone="navy" disabled={busy} onPress={() => cancel(item)} />}
      </View>)}
    </View>}
    {(status?.connected || status?.pendingPairing || pairing || reminders.some(item => item.state === 'scheduled')) && <ActionButton label="Disconnect WhatsApp and cancel queued alerts" tone="navy" disabled={busy} onPress={disconnect} />}
    {!!message && <View accessibilityLiveRegion="polite"><FormNote>{message}</FormNote></View>}
    {!!error && <FormNote error>{error}</FormNote>}
    <Text style={styles.caption}>WhatsApp is separate from phone notifications. Disconnecting cancels queued WhatsApp alerts; a message already in flight may still arrive.</Text>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  section: { gap: 14, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  heading: { gap: 9 }, eyebrow: { color: colors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.navy, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.navy, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  body: { color: colors.slate, fontSize: 13, lineHeight: 21 }, caption: { color: colors.slate, fontSize: 11, lineHeight: 18 },
  status: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cloud },
  selected: { borderColor: colors.blue, backgroundColor: colors.blueWash }, choiceLabel: { flex: 1, color: colors.navy, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  review: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: colors.cloud, borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 },
});
