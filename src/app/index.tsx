import { Redirect } from 'expo-router';
import type { RelativePathString } from 'expo-router';

export default function Index() {
  return <Redirect href={'/(app)/(tabs)/home' as RelativePathString} />;
}
