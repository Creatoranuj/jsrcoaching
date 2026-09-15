import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import Checkout from './pages/Checkout';

/**
 * App shell.
 * Single route → /checkout. Add more <Route> entries for additional pages.
 */
export default function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/checkout" component={Checkout} />
          <Route exact path="/">
            <Redirect to="/checkout" />
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}