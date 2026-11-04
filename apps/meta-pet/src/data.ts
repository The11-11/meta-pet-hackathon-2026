import type { AppData, Product } from './types';

export const initialData: AppData = {
  pet: { id: 'demo-pet', name: 'Sunny', species: 'Dog', breed: 'Golden retriever', age: '2 years' },
  logs: [], appointments: [], backendUrl: '',
  rewards: [{ id: 'demo-welcome', label: 'Welcome demo credit', amount: 200, createdAt: new Date().toISOString() }],
};

export const products: Product[] = [
  { id: 'collar', name: 'Companion collar', category: 'Stay connected', detail: 'A proposed collar with a microphone and speaker for owner-controlled check-ins. Hardware integration is not connected in this preview.', points: 120, icon: 'paw' },
  { id: 'camera', name: 'Care camera', category: 'A familiar view', detail: 'A proposed home camera for optional pet check-ins. No camera stream is connected in this preview.', points: 80, icon: 'videocam' },
  { id: 'feeder', name: 'Smart feeder', category: 'Everyday routines', detail: 'A proposed connected feeder. Purchases and remote dispensing are not available in this preview.', points: 100, icon: 'restaurant' },
];
