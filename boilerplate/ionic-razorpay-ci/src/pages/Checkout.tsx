import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { useState } from 'react';
import { pay } from '../services/PaymentService';

const PRODUCT = {
  name: 'Premium Course Access',
  description: 'Lifetime access to all chapters and live sessions',
  priceINR: 499,
};

type Toast = { show: boolean; message: string; color: 'success' | 'danger' | 'warning' };

export default function Checkout() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>({ show: false, message: '', color: 'success' });

  async function safeHaptic(type: NotificationType) {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Haptics.notification({ type });
    } catch {
      /* haptics not available */
    }
  }

  async function onPay() {
    setLoading(true);
    try {
      const result = await pay({
        amountInPaise: PRODUCT.priceINR * 100,
        name: PRODUCT.name,
        description: PRODUCT.description,
        email: 'demo@example.com',
        contact: '9999999999',
      });

      if (result.status === 'success') {
        safeHaptic(NotificationType.Success);
        setToast({
          show: true,
          message: `Payment successful — ${result.payment_id}`,
          color: 'success',
        });
      } else if (result.status === 'cancelled') {
        setToast({ show: true, message: 'Payment cancelled', color: 'warning' });
      } else {
        safeHaptic(NotificationType.Error);
        setToast({
          show: true,
          message: `Payment failed — ${result.description || 'unknown error'}`,
          color: 'danger',
        });
      }
    } catch (e: any) {
      safeHaptic(NotificationType.Error);
      setToast({ show: true, message: `Error: ${e?.message || e}`, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Checkout</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonCard>
          <IonCardHeader>
            <IonCardSubtitle>One-time purchase</IonCardSubtitle>
            <IonCardTitle>{PRODUCT.name}</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>{PRODUCT.description}</p>
            <h2 style={{ marginTop: 16 }}>₹{PRODUCT.priceINR}</h2>
            <IonButton
              expand="block"
              onClick={onPay}
              disabled={loading}
              style={{ marginTop: 24 }}
            >
              {loading ? 'Processing…' : 'Pay Now'}
            </IonButton>
          </IonCardContent>
        </IonCard>

        <IonToast
          isOpen={toast.show}
          message={toast.message}
          color={toast.color}
          duration={3500}
          onDidDismiss={() => setToast({ ...toast, show: false })}
        />
      </IonContent>
    </IonPage>
  );
}