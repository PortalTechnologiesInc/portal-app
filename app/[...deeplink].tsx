import { ThemedText } from "@/components/ThemedText";
import {
	useLocalSearchParams,
	router,
} from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useOnboarding } from "@/context/OnboardingContext";
import { useMnemonic } from "@/context/MnemonicContext";
import { useDeeplink } from "@/context/DeeplinkContext";

// Key for storing pending deeplinks - must match DeeplinkContext
const PENDING_DEEPLINK_KEY = "PENDING_DEEPLINK";

export default function DeeplinkHandler() {
	const params = useLocalSearchParams();
	const { isOnboardingComplete } = useOnboarding();
	const { mnemonic } = useMnemonic();
	const { handleDeepLink } = useDeeplink();
	
	// Flag to track if we've already processed this deeplink
	const hasProcessedDeeplink = useRef(false);

	// Determine appropriate navigation target based on app state
	const getNavigationTarget = () => {
		if (!isOnboardingComplete) {
			return "/onboarding";
		}
		if (!mnemonic) {
			return "/(tabs)/Settings";
		}
		return "/(tabs)";
	};

	useEffect(() => {
		// Skip if we've already processed this deeplink
		if (hasProcessedDeeplink.current) {
			return;
		}

		// Get deeplink segments
		const segments = Array.isArray(params.deeplink)
			? params.deeplink
			: [params.deeplink];

		// Get query params (everything except deeplink)
		const queryParams = Object.entries(params)
			.filter(([key]) => key !== "deeplink")
			.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
			.join("&");

		// Reconstruct full URL
		const path = segments.join("/");
		const reconstructedUrl = `portal://${path}${queryParams ? `?${queryParams}` : ""}`;

		console.log("Processing deeplink:", reconstructedUrl);

		// Mark as processed immediately to prevent re-processing
		hasProcessedDeeplink.current = true;

		// Navigation function that properly clears history
		const navigateWithClearHistory = () => {
			const target = getNavigationTarget();
			console.log("Clearing navigation history and navigating to:", target);
			
			// Use the proven solution from GitHub discussions
			router.dismissAll();
			router.replace(target);
		};

		// Process the deeplink if we have a valid URL
		if (reconstructedUrl && reconstructedUrl !== "portal://") {
			try {
				// Process the deeplink
				handleDeepLink(reconstructedUrl);
				// Navigate after processing with clean history
				navigateWithClearHistory();
			} catch (error) {
				console.error("Failed to process deeplink, storing for later:", error);
				// Store for later processing if DeeplinkContext fails
				SecureStore.setItemAsync(PENDING_DEEPLINK_KEY, reconstructedUrl)
					.then(() => {
						console.log("Stored deeplink for later processing");
						navigateWithClearHistory();
					})
					.catch((storeError) => {
						console.error("Failed to store deeplink:", storeError);
						// Navigate anyway to prevent the user from being stuck
						navigateWithClearHistory();
					});
			}
		} else {
			// No valid deeplink, just navigate
			navigateWithClearHistory();
		}
	}, [params, isOnboardingComplete, mnemonic, handleDeepLink]);

	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
			<ThemedText>Processing deeplink...</ThemedText>
		</View>
	);
}
