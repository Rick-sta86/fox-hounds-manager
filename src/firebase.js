// Fox & Hounds Manager — Firebase config
// Project: fox-hounds-manager | Region: europe-west2

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            'AIzaSyABArNkmpfRd7aGE-Y6S-50tzV6oDH4hpY',
  authDomain:        'fox-hounds-manager.firebaseapp.com',
  projectId:         'fox-hounds-manager',
  storageBucket:     'fox-hounds-manager.firebasestorage.app',
  messagingSenderId: '997719695722',
  appId:             '1:997719695722:web:b86df79ac5d39ac06fc513',
}

const app = initializeApp(firebaseConfig)
export const db      = getFirestore(app)
export const auth    = getAuth(app)
export const storage = getStorage(app)

// Auto sign-in anonymously — required for Firestore security rules
signInAnonymously(auth).catch(err => console.warn('Anonymous auth failed:', err))
