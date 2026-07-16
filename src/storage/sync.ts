import { doc, getDocs, collection, setDoc } from "firebase/firestore";
import { db } from "../auth/firebase";

export async function fetchUserRatings(uid: string): Promise<Record<string, number>> {
  const ratings: Record<string, number> = {};
  try {
    const querySnapshot = await getDocs(collection(db, "users", uid, "ratings"));
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (typeof data.rating === "number") {
        ratings[doc.id] = data.rating;
      }
    });
  } catch (error) {
    console.error("Error fetching user ratings:", error);
  }
  return ratings;
}

export async function fetchUserReviews(uid: string): Promise<Record<string, string>> {
  const reviews: Record<string, string> = {};
  try {
    const querySnapshot = await getDocs(collection(db, "users", uid, "reviews"));
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (typeof data.status === "string") {
        reviews[doc.id] = data.status;
      }
    });
  } catch (error) {
    console.error("Error fetching user reviews:", error);
  }
  return reviews;
}

export async function saveUserRating(uid: string, trackId: string, rating: number): Promise<void> {
  try {
    await setDoc(doc(db, "users", uid, "ratings", trackId), {
      rating,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error saving user rating:", error);
  }
}

export async function saveUserReview(uid: string, trackId: string, status: string): Promise<void> {
  try {
    await setDoc(doc(db, "users", uid, "reviews", trackId), {
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error saving user review:", error);
  }
}

export async function syncLocalDataToFirestore(
  uid: string,
  localRatings: Record<string, number>,
  localReviews: Record<string, string>
): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [trackId, rating] of Object.entries(localRatings)) {
    promises.push(saveUserRating(uid, trackId, rating));
  }
  for (const [trackId, status] of Object.entries(localReviews)) {
    promises.push(saveUserReview(uid, trackId, status));
  }
  await Promise.all(promises);
}
