import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile, EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeAccountDetails, type AccountDetails } from './accountDetails';
import { commitAccountDetails } from './commitAccountDetails';
import { db } from '../../lib/firebase';
import { auth } from '../../lib/firebaseAuth';
import { syncIdentity } from './syncIdentity';
import { startGoogleSignIn } from './googleSignIn';
import { googleAccountNeedsSetup } from './googleAccountSetup';
import { linkCurrentUserWithGoogle } from './linkGoogleAccount';
import { deleteCurrentAccount } from './accountDeletion';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  needsAccountSetup: boolean;
  accountDetails: AccountDetails | null;
  completeGoogleAccountSetup: (name: string, details: AccountDetails) => Promise<void>;
  saveAccountDetails: (details: AccountDetails) => Promise<void>;
  changeEmail: (email: string, currentPassword: string) => Promise<void>;
  changePassword: (password: string, currentPassword: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  googleLinked: boolean;
  linkGoogleAccount: () => Promise<void>;
  signUp: (name: string, email: string, password: string, details: AccountDetails) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: (birthDate: string) => Promise<void>;
  signOut: () => Promise<void>;
  useDifferentAccount: () => Promise<void>;
  signedOutDestination: 'welcome' | 'signup';
  showWelcome: () => void;
  authNotice: string;
  clearAuthNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function provisionGoogleUser(user: User) {
  const providerIds = user.providerData.map(provider => provider.providerId);
  if (!providerIds.includes(GoogleAuthProvider.PROVIDER_ID)) return false;
  const email = user.email?.trim().toLowerCase();
  if (!email) throw Error('Your Google account did not provide an email address.');
  const reference = doc(db, 'users', user.uid);
  const existing = await getDoc(reference);
  if (existing.exists()) return googleAccountNeedsSetup(providerIds, existing.data().accountDetails);
  const fallbackName = email.split('@')[0] || 'CUBO driver';
  const name = (user.displayName?.trim() || fallbackName).slice(0, 80);
  await setDoc(reference, {
    uid: user.uid,
    name,
    email,
    theme: 'light',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [needsAccountSetup, setNeedsAccountSetup] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState('');
  const [providerRevision, setProviderRevision] = useState(0);
  const [signedOutDestination, setSignedOutDestination] = useState<'welcome' | 'signup'>('welcome');

  useEffect(() => {
    return onAuthStateChanged(auth, async nextUser => {
      setLoading(true);
      try {
        const requiresSetup = nextUser ? await provisionGoogleUser(nextUser) : false;
        if (nextUser) setSignedOutDestination('welcome');
        setNeedsAccountSetup(requiresSetup);
        setUser(nextUser);
      } catch (cause) {
        setUser(null);
        setNeedsAccountSetup(false);
        setAuthNotice(cause instanceof Error ? cause.message : 'CUBO could not finish setting up your Google account.');
        await firebaseSignOut(auth).catch(() => undefined);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    let active = true; let cloudSeen = false; setAccountDetails(null);
    if (!user) return;
    const key = `cubo-account-details:${user.uid}`;
    const parse = (raw: unknown) => {
      try {
        const value = raw as AccountDetails;
        if (!value?.birthDate || typeof value.phoneNumber !== 'string') return null;
        const [year, month, day] = value.birthDate.split('-');
        return makeAccountDetails(`${month}/${day}/${year}`, value.phoneNumber);
      } catch { return null; }
    };
    void AsyncStorage.getItem(key).then(raw => { if (active && !cloudSeen && raw) setAccountDetails(parse(JSON.parse(raw))); }).catch(() => undefined);
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), snapshot => {
      if (!active || auth.currentUser?.uid !== user.uid || snapshot.metadata.hasPendingWrites) return;
      cloudSeen = true;
      const details = parse(snapshot.data()?.accountDetails);
      if (details) { setAccountDetails(details); setNeedsAccountSetup(false); void AsyncStorage.setItem(key, JSON.stringify(details)).catch(() => undefined); }
    }, () => undefined);
    return () => { active = false; unsubscribe(); };
  }, [user?.uid]);
  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  }, []);
  const signInWithGoogle = useCallback(async () => {
    setAuthNotice('');
    await startGoogleSignIn();
  }, []);
  const googleLinked = user?.providerData.some(provider => provider.providerId === GoogleAuthProvider.PROVIDER_ID) ?? false;
  const linkGoogleAccount = useCallback(async () => {
    await linkCurrentUserWithGoogle();
    setProviderRevision(value => value + 1);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, details: AccountDetails) => {
    setProvisioning(true);
    try {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    await AsyncStorage.setItem(`cubo-account-details:${credential.user.uid}`, JSON.stringify(details));
    setAccountDetails(details);
    await updateProfile(credential.user, { displayName: cleanName });
    await setDoc(doc(db, 'users', credential.user.uid), {
      uid: credential.user.uid,
      name: cleanName,
      email: cleanEmail,
      theme: 'light',
      accountDetails: details,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    } finally { setProvisioning(false); }
  }, []);

  const completeGoogleAccountSetup = useCallback(async (name: string, details: AccountDetails) => {
    const current = auth.currentUser;
    if (!current || !current.providerData.some(provider => provider.providerId === GoogleAuthProvider.PROVIDER_ID)) throw Error('Sign in with Google before completing your account.');
    const cleanName = name.trim();
    if (!cleanName) throw Error('Enter your name.');
    if (cleanName.length > 80) throw Error('Keep your name under 80 characters.');
    const [year, month, day] = details.birthDate.split('-');
    const validated = makeAccountDetails(`${month}/${day}/${year}`, details.phoneNumber);
    await Promise.all([
      updateProfile(current, { displayName: cleanName }),
      updateDoc(doc(db, 'users', current.uid), { name: cleanName, accountDetails: validated, updatedAt: serverTimestamp() }),
    ]);
    await AsyncStorage.setItem(`cubo-account-details:${current.uid}`, JSON.stringify(validated)).catch(() => undefined);
    if (auth.currentUser?.uid === current.uid) {
      setAccountDetails(validated);
      setNeedsAccountSetup(false);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  }, []);
  const deleteAccount = useCallback(async (birthDate: string) => {
    const current = auth.currentUser;
    if (!current) throw Error('Sign in before deleting your account.');
    setSignedOutDestination('welcome');
    await deleteCurrentAccount(current, birthDate);
    setAccountDetails(null);
    setNeedsAccountSetup(false);
  }, []);
  const signOut = useCallback(async () => {
    setSignedOutDestination('welcome');
    await firebaseSignOut(auth);
    setNeedsAccountSetup(false);
  }, []);
  const useDifferentAccount = useCallback(async () => {
    setSignedOutDestination('signup');
    await firebaseSignOut(auth);
    setNeedsAccountSetup(false);
  }, []);
  const showWelcome = useCallback(() => setSignedOutDestination('welcome'), []);
  const saveAccountDetails = useCallback(async (details: AccountDetails) => {
    const current = auth.currentUser;
    if (!current) throw Error('Sign in before changing account details.');
    await syncIdentity(current);
    const [year, month, day] = details.birthDate.split('-');
    const validated = makeAccountDetails(`${month}/${day}/${year}`, details.phoneNumber);
    await commitAccountDetails(validated, {
      persistCloud: value => updateDoc(doc(db, 'users', current.uid), { accountDetails: value, updatedAt: serverTimestamp() }),
      cacheLocally: value => AsyncStorage.setItem(`cubo-account-details:${current.uid}`, JSON.stringify(value)),
      onSaved: value => { if (auth.currentUser?.uid === current.uid) setAccountDetails(value); },
    });
  }, []);
  const reauthenticate = async (password: string) => {
    const current = auth.currentUser;
    if (!current?.email) throw Error('Sign in again before changing security settings.');
    if (!password) throw Error('Enter your current password to confirm this change.');
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
    return current;
  };
  const changeEmail = useCallback(async (email: string, currentPassword: string) => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw Error('Enter a valid new email address.');
    const current = await reauthenticate(currentPassword);
    await verifyBeforeUpdateEmail(current, clean);
  }, []);
  const changePassword = useCallback(async (password: string, currentPassword: string) => {
    if (password.length < 8) throw Error('Use at least 8 characters for your new password.');
    const current = await reauthenticate(currentPassword);
    await updatePassword(current, password);
  }, []);
  const clearAuthNotice = useCallback(() => setAuthNotice(''), []);
  const value = useMemo(() => ({ user, loading: loading || provisioning, needsAccountSetup, accountDetails, completeGoogleAccountSetup, saveAccountDetails, changeEmail, changePassword, signIn, signInWithGoogle, googleLinked, linkGoogleAccount, signUp, resetPassword, deleteAccount, signOut, useDifferentAccount, signedOutDestination, showWelcome, authNotice, clearAuthNotice }), [loading, provisioning, needsAccountSetup, accountDetails, completeGoogleAccountSetup, saveAccountDetails, changeEmail, changePassword, resetPassword, deleteAccount, signIn, signInWithGoogle, googleLinked, linkGoogleAccount, providerRevision, signOut, useDifferentAccount, signedOutDestination, showWelcome, signUp, user, authNotice, clearAuthNotice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
