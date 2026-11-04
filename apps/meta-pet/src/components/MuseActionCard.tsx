import { Text, View } from 'react-native';
import type { MuseAction } from '../museActions';
import { useTheme } from '../ThemeContext';
import { ActionButton } from './ui';

export function MuseActionCard({ action, status, onApprove, onDismiss }: {
  action: MuseAction; status: 'pending' | 'saving' | 'saved' | 'dismissed' | 'expired'; onApprove: () => void; onDismiss: () => void;
}) {
  const { colors } = useTheme();
  if (action.type === 'draft_social_post') return <View style={{ gap: 12, marginTop: 8, padding: 15, borderRadius: 16, backgroundColor: colors.cloud, borderColor: colors.line, borderWidth: 1 }}>
    <Text style={{ color: colors.violet, fontWeight: '700', fontSize: 11 }}>REVIEW POST DRAFT</Text>
    <Text style={{ color: colors.navy, fontWeight: '700', fontSize: 15 }}>{action.payload.platform === 'facebook' ? 'Facebook' : 'Instagram'} · @{action.payload.petHandle}</Text>
    <Text selectable style={{ color: colors.navy, fontSize: 14, lineHeight: 22 }}>{action.payload.caption}</Text>
    {!!action.payload.note && <Text style={{ color: colors.slate, fontSize: 12 }}>{action.payload.note}</Text>}
    <Text style={{ color: colors.slate, fontSize: 11, lineHeight: 17 }}>Your pet’s @handle is included automatically. Approval saves a draft in Social pages on this device. It does not publish or tag a live post.</Text>
    {status === 'pending' || status === 'saving' ? <>
      <ActionButton label={status === 'saving' ? 'Saving…' : 'Approve and save draft'} disabled={status === 'saving'} tone="violet" onPress={onApprove} icon="checkmark-outline" />
      <ActionButton label="Dismiss suggestion" disabled={status === 'saving'} tone="navy" onPress={onDismiss} />
    </> : <Text accessibilityLiveRegion="polite" style={{ color: colors.violet, fontSize: 12, fontWeight: '700' }}>{status === 'saved' ? 'Draft saved in Social pages.' : status === 'expired' ? 'This suggestion has expired. Ask Muse for a fresh draft.' : 'Dismissed. Nothing saved.'}</Text>}
  </View>;
  const care = action.type === 'record_care';
  const label = care ? action.payload.label : action.payload.title;
  const date = care ? action.payload.recordedAt : action.payload.date;
  return <View style={{ gap: 12, marginTop: 8, padding: 15, borderRadius: 16, backgroundColor: colors.cloud, borderColor: colors.line, borderWidth: 1 }}>
    <Text style={{ color: colors.violet, fontWeight: '700', fontSize: 11 }}>REVIEW BEFORE SAVING</Text>
    <Text style={{ color: colors.navy, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    <Text style={{ color: colors.slate, fontSize: 12, lineHeight: 19 }}>{care ? `Care entry · ${action.payload.kind}` : 'Appointment entry'}{'\n'}{new Date(date).toLocaleString()}{'\n'}{action.payload.note || 'No additional notes.'}</Text>
    <Text style={{ color: colors.slate, fontSize: 11, lineHeight: 17 }}>{care ? 'Only approve if this activity happened. This saves a care record on this device.' : 'This saves an appointment note on this device. Phone reminders depend on your alert settings and permission. It does not book with your vet.'}</Text>
    {status === 'pending' || status === 'saving' ? <>
      <ActionButton label={status === 'saving' ? 'Saving…' : 'Approve and save'} disabled={status === 'saving'} tone="violet" onPress={onApprove} icon="checkmark-outline" />
      <ActionButton label="Dismiss suggestion" disabled={status === 'saving'} tone="navy" onPress={onDismiss} />
    </> : <Text accessibilityLiveRegion="polite" style={{ color: colors.violet, fontSize: 12, fontWeight: '700' }}>{status === 'saved' ? 'Approved and saved on this device.' : status === 'expired' ? 'This suggestion has expired. Ask Muse for a fresh one.' : 'Dismissed. Nothing saved.'}</Text>}
  </View>;
}
