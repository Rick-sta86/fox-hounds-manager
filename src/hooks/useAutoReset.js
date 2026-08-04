// useAutoReset.js
// Runs once on app mount. For each checklist cadence, checks whether the
// current reset period has already been handled. If not, resets all completed
// tasks for that cadence and records the reset time in Firestore.

import { useEffect } from 'react'
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

const CADENCES = ['weekly', 'monthly', 'sixmonthly', 'yearly']

// Returns the start of the current reset period for a given cadence.
// If lastResetAt >= this date, no reset is needed.
function getResetThreshold(cadence) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (cadence === 'weekly') {
    // Start of this Monday
    const day = now.getDay() // 0 = Sun
    const daysSinceMon = day === 0 ? 6 : day - 1
    const monday = new Date(now)
    monday.setDate(monday.getDate() - daysSinceMon)
    return monday
  }

  if (cadence === 'monthly') {
    // 1st of this month
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  if (cadence === 'sixmonthly') {
    // Most recent of Jan 1 or Jul 1
    const month = now.getMonth()
    return month >= 6
      ? new Date(now.getFullYear(), 6, 1)   // Jul 1
      : new Date(now.getFullYear(), 0, 1)   // Jan 1
  }

  // yearly
  return new Date(now.getFullYear(), 0, 1)
}

export function useAutoReset() {
  useEffect(() => {
    async function checkAndReset() {
      for (const cadence of CADENCES) {
        try {
          const threshold = getResetThreshold(cadence)

          // Check last reset time
          const resetRef  = doc(db, 'checklist_resets', cadence)
          const resetSnap = await getDoc(resetRef)

          if (!resetSnap.exists()) {
            // First run — record now, don't touch tasks
            await setDoc(resetRef, { lastResetAt: serverTimestamp() })
            continue
          }

          const lastReset = resetSnap.data().lastResetAt?.toDate()
          if (lastReset && lastReset >= threshold) continue // already reset this period

          // Fetch all completed tasks for this cadence (single where = no composite index)
          const q = query(
            collection(db, 'recurring_tasks'),
            where('cadence', '==', cadence)
          )
          const snap = await getDocs(q)
          const completedDocs = snap.docs.filter((d) => d.data().completed === true)

          // Batch-reset + update the reset record
          const batch = writeBatch(db)
          completedDocs.forEach((d) => batch.update(d.ref, { completed: false }))
          batch.set(resetRef, { lastResetAt: serverTimestamp() })
          await batch.commit()

          if (completedDocs.length > 0) {
            console.log(`[Auto-reset] ${cadence}: reset ${completedDocs.length} task(s)`)
          }
        } catch (err) {
          console.warn(`[Auto-reset] ${cadence} failed:`, err)
        }
      }
    }

    checkAndReset()
  }, []) // run once on mount
}
