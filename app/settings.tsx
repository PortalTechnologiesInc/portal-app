import React, { useState, useEffect } from 'react';
import {
	StyleSheet,
	TouchableOpacity,
	Alert,
	TextInput,
	Image,
	View,
	ScrollView,
	RefreshControl,
	Switch,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, Pencil, ChevronRight, Fingerprint, Shield } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboarding } from '@/context/OnboardingContext';
import { useUserProfile } from '@/context/UserProfileContext';
import {
	isWalletConnected,
	walletUrlEvents,
	deleteMnemonic,
	getMnemonic,
} from '@/services/SecureStorageService';
import * as ImagePicker from 'expo-image-picker';
import { resetDatabase } from '@/services/database/DatabaseProvider';
import { useNostrService } from '@/context/NostrServiceContext';
import { showToast } from '@/utils/Toast';
import { authenticateForSensitiveAction } from '@/services/BiometricAuthService';
import { isAppLockEnabled, setAppLockEnabled, canEnableAppLock } from '@/services/AppLockService';
import { useAppLock } from '@/context/AppLockContext';

export default function SettingsScreen() {
	const router = useRouter();
	const { resetOnboarding } = useOnboarding();
	const { username, avatarUri, setUsername, setAvatarUri, isProfileEditable, fetchProfile } =
		useUserProfile();
	const nostrService = useNostrService();
	const { refreshLockStatus } = useAppLock();
	const [isWalletConnectedState, setIsWalletConnectedState] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [usernameInput, setUsernameInput] = useState('');
	const [profileIsLoading, setProfileIsLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [appLockEnabled, setAppLockEnabledState] = useState(false);
	const [biometricAvailable, setBiometricAvailable] = useState(false);

	// Initialize wallet connection status and app lock settings
	useEffect(() => {
		const checkWalletConnection = async () => {
			try {
				const walletConnected = await isWalletConnected();
				setIsWalletConnectedState(walletConnected);
			} catch (error) {
				console.error('Error checking connection:', error);
			}
		};

		const checkAppLockSettings = async () => {
			try {
				const [lockEnabled, biometricEnabled] = await Promise.all([
					isAppLockEnabled(),
					canEnableAppLock(),
				]);
				setAppLockEnabledState(lockEnabled);
				setBiometricAvailable(biometricEnabled);
			} catch (error) {
				console.error('Error checking app lock settings:', error);
			}
		};

		const initializeSettings = async () => {
			await Promise.all([checkWalletConnection(), checkAppLockSettings()]);
			setIsLoading(false);
		};

		initializeSettings();

		// Subscribe to wallet URL changes
		const subscription = walletUrlEvents.addListener('walletUrlChanged', async newUrl => {
			setIsWalletConnectedState(Boolean(newUrl?.trim()));
		});

		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (username) {
			setUsernameInput(username);
		}
	}, [username]);

	const handleAvatarPress = async () => {
		// Don't allow avatar change during sync
		if (!isProfileEditable) {
			Alert.alert(
				'Profile Sync in Progress',
				'Please wait for profile synchronization to complete before making changes.'
			);
			return;
		}

		try {
			const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

			if (!permissionResult.granted) {
				Alert.alert(
					'Permission Required',
					'You need to allow access to your photos to change your avatar.'
				);
				return;
			}

			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ['images'],
				allowsEditing: true,
				aspect: [1, 1],
				quality: 0.8,
			});

			if (!result.canceled) {
				await setAvatarUri(result.assets[0].uri);
			}
		} catch (error) {
			console.error('Error selecting image:', error);
			Alert.alert('Error', 'Failed to select image. Please try again.');
		}
	};

	const handleRefreshProfile = async () => {
		try {
			// Get the current public key from NostrService to refresh profile
			if (nostrService.publicKey) {
				console.log('Public key:', nostrService.publicKey);
				await fetchProfile(nostrService.publicKey);
				showToast('Profile refreshed successfully', 'success');
			} else {
				showToast('Unable to refresh profile', 'error');
			}
		} catch (error) {
			// Silently handle profile fetch errors
			showToast('Failed to refresh profile', 'error');
		}
	};

	const onRefresh = async () => {
		setRefreshing(true);
		await handleRefreshProfile();
		setRefreshing(false);
	};

	const handleSaveProfile = async () => {
		// Don't allow profile save during sync
		if (!isProfileEditable) {
			Alert.alert(
				'Profile Sync in Progress',
				'Please wait for profile synchronization to complete before making changes.'
			);
			return;
		}

		try {
			setProfileIsLoading(true);

			// Capitalize the first letter of the username if it exists
			const capitalizedUsername = usernameInput.trim()
				? usernameInput.charAt(0).toUpperCase() + usernameInput.slice(1)
				: '';

			// Even if username is empty, we still append @getportal.cc
			// This ensures pubkey format is consistent regardless of username presence
			await setUsername(capitalizedUsername);

			await nostrService.setUserProfile({
				nip05: `${capitalizedUsername}@getportal.cc`,
				name: capitalizedUsername,
				picture: avatarUri || '',
				displayName: capitalizedUsername,
			});

			handleRefreshProfile();

			Alert.alert('Success', 'Profile updated successfully');
		} catch (error) {
			console.error('Error saving profile:', error);
			Alert.alert('Error', 'Failed to save profile. Please try again.');
		} finally {
			setProfileIsLoading(false);
		}
	};

	const handleClearAppData = () => {
		Alert.alert(
			'Reset App',
			'This will reset all app data and take you back to onboarding. Are you sure?',
			[
				{
					text: 'Cancel',
					style: 'cancel',
				},
				{
					text: 'Clear Data',
					style: 'destructive',
					onPress: () => {
						// Require biometric authentication before proceeding with the destructive action
						authenticateForSensitiveAction(async () => {
							try {
								// Clear user profile data but maintain pubkey format
								await setUsername('');
								await setAvatarUri(null);

								// Delete mnemonic first - this triggers database disconnection
								deleteMnemonic();

								// Reset the database (will work with new connection)
								await resetDatabase();

								// Reset onboarding state (this navigates to onboarding screen)
								await resetOnboarding();
							} catch (error) {
								console.error('Error clearing app data:', error);
								Alert.alert('Error', 'Failed to Reset App. Please try again.');
							}
						}, 'Authenticate to reset all app data');
					},
				},
			]
		);
	};

	const handleWalletCardPress = () => {
		// Navigate to wallet management page with proper source parameter
		router.push({
			pathname: '/wallet',
			params: {
				source: 'settings',
			},
		});
	};

	const handleNostrCardPress = () => {
		// Navigate to nostr management page with proper source parameter
		router.push({
			pathname: "/relays",
			params: {
				source: "settings",
			},
		});
	};

	const handleExportMnemonic = () => {
		authenticateForSensitiveAction(async () => {
			console.log('Exporting mnemonic...');
			try {
				const mnemonic = await getMnemonic();
				console.log('Mnemonic:', mnemonic);
				if (mnemonic) {
					Clipboard.setString(mnemonic);
					showToast('Mnemonic copied to clipboard', 'success');
				} else {
					showToast('No mnemonic found', 'error');
				}
			} catch (error) {
				console.error('Error exporting mnemonic:', error);
				showToast('Failed to export mnemonic', 'error');
			}
		}, 'Authenticate to export your seed phrase');
	};

	const handleExportAppData = () => {
		authenticateForSensitiveAction(async () => {
			console.log('Exporting app data...');
			// TODO: Implement app data export logic
			showToast('App data export not yet implemented', 'success');
		}, 'Authenticate to export app data');
	};

	const handleToggleAppLock = async (enabled: boolean) => {
		if (enabled && !biometricAvailable) {
			Alert.alert(
				'Biometric Authentication Required',
				'To enable app lock, you need to set up biometric authentication (fingerprint, face recognition, or PIN) on your device first.',
				[{ text: 'OK' }]
			);
			return;
		}

		if (enabled) {
			// When enabling, require authentication to confirm
			authenticateForSensitiveAction(async () => {
				try {
					await setAppLockEnabled(true);
					setAppLockEnabledState(true);
					// Don't lock immediately when user is actively enabling it
					await refreshLockStatus(false);
					showToast('App lock enabled', 'success');
				} catch (error) {
					console.error('Error enabling app lock:', error);
					showToast('Failed to enable app lock', 'error');
				}
			}, 'Authenticate to enable app lock');
		} else {
			// When disabling, require authentication to confirm
			authenticateForSensitiveAction(async () => {
				try {
					await setAppLockEnabled(false);
					setAppLockEnabledState(false);
					// When disabling, unlock the app
					await refreshLockStatus(false);
					showToast('App lock disabled', 'success');
				} catch (error) {
					console.error('Error disabling app lock:', error);
					showToast('Failed to disable app lock', 'error');
				}
			}, 'Authenticate to disable app lock');
		}
	};

	if (isLoading) {
		return (
			<SafeAreaView style={styles.safeArea} edges={['top']}>
				<ThemedView style={styles.container}>
					<ThemedView style={styles.header}>
						<TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
							<ArrowLeft size={20} color={Colors.almostWhite} />
						</TouchableOpacity>
						<ThemedText
							style={styles.headerText}
							lightColor={Colors.darkGray}
							darkColor={Colors.almostWhite}
						>
							Settings
						</ThemedText>
					</ThemedView>
					<ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
						<ThemedText>Loading...</ThemedText>
					</ScrollView>
				</ThemedView>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ThemedView style={styles.container}>
				<ThemedView style={styles.header}>
					<TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
						<ArrowLeft size={20} color={Colors.almostWhite} />
					</TouchableOpacity>
					<ThemedText
						style={styles.headerText}
						lightColor={Colors.darkGray}
						darkColor={Colors.almostWhite}
					>
						Settings
					</ThemedText>
				</ThemedView>

				<ScrollView
					style={styles.content}
					contentContainerStyle={styles.contentContainer}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							colors={[Colors.green]}
							tintColor={Colors.green}
							title="Pull to refresh profile"
							titleColor={Colors.almostWhite}
						/>
					}
				>
					{/* Profile Section */}
					<ThemedView style={styles.section}>
						<View style={styles.sectionHeader}>
							<ThemedText style={styles.sectionTitle}>Profile</ThemedText>
						</View>
						<ThemedView style={styles.profileSection}>
							<TouchableOpacity
								style={[
									styles.avatarContainer,
									!isProfileEditable && styles.avatarContainerDisabled,
								]}
								onPress={handleAvatarPress}
								disabled={!isProfileEditable}
							>
								{avatarUri ? (
									<Image source={{ uri: avatarUri }} style={styles.avatar} />
								) : (
									<View style={styles.avatarPlaceholder}>
										<User size={40} color={Colors.almostWhite} />
									</View>
								)}
								<View
									style={[
										styles.avatarEditBadge,
										!isProfileEditable && styles.avatarEditBadgeDisabled,
									]}
								>
									<Pencil size={12} color={Colors.almostWhite} />
								</View>
							</TouchableOpacity>

							<View style={styles.usernameContainer}>
								<TextInput
									style={[styles.usernameInput, !isProfileEditable && styles.usernameInputDisabled]}
									value={usernameInput}
									onChangeText={setUsernameInput}
									placeholder="username"
									placeholderTextColor={Colors.gray}
									autoCapitalize="none"
									autoCorrect={false}
									editable={isProfileEditable}
								/>
								<ThemedText style={styles.usernameSuffix}>@getportal.cc</ThemedText>
							</View>

							<View style={styles.profileButtonsContainer}>
								<TouchableOpacity
									style={[
										styles.saveButton,
										(!isProfileEditable || profileIsLoading) && styles.saveButtonDisabled,
									]}
									onPress={handleSaveProfile}
									disabled={!isProfileEditable || profileIsLoading}
								>
									<ThemedText
										style={[
											styles.saveButtonText,
											(!isProfileEditable || profileIsLoading) && styles.saveButtonTextDisabled,
										]}
									>
										{profileIsLoading ? 'Saving...' : 'Save Profile'}
									</ThemedText>
								</TouchableOpacity>
							</View>
						</ThemedView>
					</ThemedView>

					{/* Wallet Section */}
					<ThemedView style={styles.section}>
						<ThemedText style={styles.sectionTitle}>Wallet</ThemedText>
						<ThemedView style={styles.walletSection}>
							<TouchableOpacity
								style={styles.card}
								onPress={handleWalletCardPress}
								activeOpacity={0.7}
							>
								<View style={styles.cardContent}>
									<View style={styles.cardLeft}>
										<ThemedText style={styles.cardTitle}>Wallet Connect</ThemedText>
										<ThemedText style={styles.cardStatus}>
											{isWalletConnectedState ? 'Connected' : 'Not connected'}
										</ThemedText>
									</View>
									<ChevronRight size={24} color={Colors.almostWhite} />
								</View>
							</TouchableOpacity>
						</ThemedView>
					</ThemedView>

					{/* Nostr Section */}
					<ThemedView style={styles.section}>
						<ThemedText style={styles.sectionTitle}>Relays</ThemedText>
						<ThemedView style={styles.walletSection}>
							<TouchableOpacity
								style={styles.card}
								onPress={handleNostrCardPress}
								activeOpacity={0.7}
							>
								<View style={styles.cardContent}>
									<View style={styles.cardLeft}>
										<ThemedText style={styles.cardTitle}>
											Nostr relays
										</ThemedText>
										<ThemedText style={styles.cardStatus}>
											Manage the Nostr relays your app connects to
										</ThemedText>
									</View>
									<ChevronRight size={24} color={Colors.almostWhite} />
								</View>
							</TouchableOpacity>
						</ThemedView>
					</ThemedView>

					{/* Security Section */}
					<ThemedView style={styles.section}>
						<ThemedText style={styles.sectionTitle}>Security</ThemedText>
						<ThemedView style={styles.securitySection}>
							<View style={styles.appLockOption}>
								<View style={styles.appLockLeft}>
									<View style={styles.appLockIconContainer}>
										<Shield size={24} color={Colors.almostWhite} />
									</View>
									<View style={styles.appLockTextContainer}>
										<ThemedText style={styles.appLockTitle}>App Lock</ThemedText>
										<ThemedText style={styles.appLockDescription}>
											{biometricAvailable
												? 'Require biometric authentication to open the app'
												: 'Biometric authentication not available'}
										</ThemedText>
									</View>
								</View>
								<Switch
									value={appLockEnabled}
									onValueChange={handleToggleAppLock}
									disabled={!biometricAvailable}
									trackColor={{
										false: Colors.gray,
										true: Colors.green,
									}}
									thumbColor={appLockEnabled ? Colors.almostWhite : Colors.dirtyWhite}
									ios_backgroundColor={Colors.gray}
								/>
							</View>
						</ThemedView>
					</ThemedView>

					{/* Export Section */}
					<ThemedView style={styles.section}>
						<ThemedText style={styles.sectionTitle}>Export</ThemedText>
						<ThemedView style={styles.exportSection}>
							<TouchableOpacity style={styles.exportButton} onPress={handleExportMnemonic}>
								<View style={styles.exportButtonContent}>
									<ThemedText style={styles.exportButtonText}>Export Mnemonic</ThemedText>
									<View style={styles.fingerprintIcon}>
										<Fingerprint size={20} color={Colors.almostWhite} />
									</View>
								</View>
							</TouchableOpacity>
						</ThemedView>
						<ThemedView style={styles.exportSection}>
							<TouchableOpacity style={styles.exportButton} onPress={handleExportAppData}>
								<View style={styles.exportButtonContent}>
									<ThemedText style={styles.exportButtonText}>Export App Data</ThemedText>
									<View style={styles.fingerprintIcon}>
										<Fingerprint size={20} color={Colors.almostWhite} />
									</View>
								</View>
							</TouchableOpacity>
						</ThemedView>
					</ThemedView>

					{/* Extra Section */}
					<ThemedView style={styles.section}>
						<ThemedText style={styles.sectionTitle}>Extra</ThemedText>
						<ThemedView style={styles.extraSection}>
							<TouchableOpacity style={styles.clearDataButton} onPress={handleClearAppData}>
								<View style={styles.clearDataButtonContent}>
									<ThemedText style={styles.clearDataButtonText}>Reset App</ThemedText>
									<View style={styles.fingerprintIcon}>
										<Fingerprint size={20} color="white" />
									</View>
								</View>
							</TouchableOpacity>
						</ThemedView>
					</ThemedView>
				</ScrollView>
			</ThemedView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: '#000000',
	},
	container: {
		flex: 1,
		backgroundColor: '#000000',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingTop: 10,
		paddingBottom: 20,
		backgroundColor: '#000000',
	},
	backButton: {
		marginRight: 15,
	},
	headerText: {
		fontSize: 20,
		fontWeight: 'bold',
	},
	content: {
		flex: 1,
		paddingHorizontal: 20,
	},
	contentContainer: {
		paddingVertical: 12,
	},
	section: {
		marginBottom: 24,
		width: '100%',
	},
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 12,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: Colors.almostWhite,
	},
	profileSection: {
		alignItems: 'center',
		paddingVertical: 12,
		width: '100%',
	},
	walletSection: {
		paddingVertical: 12,
		width: '100%',
	},
	extraSection: {
		paddingVertical: 12,
		width: '100%',
	},
	exportSection: {
		paddingVertical: 6,
		width: '100%',
	},
	card: {
		backgroundColor: Colors.darkGray,
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	cardContent: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	cardLeft: {
		flex: 1,
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: Colors.almostWhite,
		marginBottom: 4,
	},
	cardStatus: {
		fontSize: 14,
		color: Colors.dirtyWhite,
	},
	avatarContainer: {
		position: 'relative',
		width: 120,
		height: 120,
		marginBottom: 24,
	},
	avatar: {
		width: 120,
		height: 120,
		borderRadius: 60,
		borderWidth: 2,
		borderColor: Colors.almostWhite,
	},
	avatarPlaceholder: {
		width: 120,
		height: 120,
		borderRadius: 60,
		backgroundColor: Colors.darkGray,
		borderWidth: 2,
		borderColor: Colors.almostWhite,
		justifyContent: 'center',
		alignItems: 'center',
	},
	avatarEditBadge: {
		position: 'absolute',
		bottom: 8,
		right: 8,
		backgroundColor: Colors.darkGray,
		width: 35,
		height: 35,
		borderRadius: 50,
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 2,
		borderColor: Colors.almostWhite,
	},
	usernameContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		borderBottomWidth: 1,
		borderBottomColor: Colors.gray,
		marginBottom: 24,
		width: '100%',
		maxWidth: 500,
		alignSelf: 'center',
	},
	usernameInput: {
		color: Colors.almostWhite,
		fontSize: 16,
		flex: 1,
		paddingVertical: 8,
	},
	usernameSuffix: {
		color: Colors.gray,
		fontSize: 16,
	},
	profileButtonsContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		width: '100%',
		maxWidth: 500,
		alignSelf: 'center',
	},
	saveButton: {
		backgroundColor: Colors.darkGray,
		padding: 16,
		borderRadius: 8,
		width: '100%',
		maxWidth: 500,
		alignItems: 'center',
		alignSelf: 'center',
	},
	saveButtonText: {
		color: Colors.almostWhite,
		fontSize: 16,
		fontWeight: 'bold',
	},
	saveButtonDisabled: {
		backgroundColor: Colors.gray,
	},
	saveButtonTextDisabled: {
		color: Colors.dirtyWhite,
	},
	clearDataButton: {
		backgroundColor: '#FF3B30',
		padding: 16,
		borderRadius: 8,
		width: '100%',
		maxWidth: 500,
		alignItems: 'center',
		alignSelf: 'center',
	},
	clearDataButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: 'bold',
		textAlign: 'center',
		alignSelf: 'center',
		justifyContent: 'center',
		width: '100%',
		maxWidth: 500,
		marginRight: 0,
		paddingRight: 0,
		paddingLeft: 0,
		marginLeft: 0,
	},
	avatarContainerDisabled: {
		opacity: 0.5,
	},
	avatarEditBadgeDisabled: {
		opacity: 0.5,
	},
	usernameInputDisabled: {
		opacity: 0.5,
	},
	exportButton: {
		backgroundColor: Colors.primaryDark,
		padding: 16,
		borderRadius: 8,
		width: '100%',
		maxWidth: 500,
		alignItems: 'center',
		alignSelf: 'center',
		marginBottom: 8,
	},
	exportButtonText: {
		color: Colors.almostWhite,
		fontSize: 16,
		fontWeight: 'bold',
	},
	exportButtonContent: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		width: '100%',
		position: 'relative',
	},
	clearDataButtonContent: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		width: '100%',
		position: 'relative',
	},
	fingerprintIcon: {
		position: 'absolute',
		right: 0,
	},
	securitySection: {
		paddingVertical: 12,
		width: '100%',
	},
	appLockOption: {
		backgroundColor: Colors.darkGray,
		borderRadius: 12,
		padding: 16,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	appLockLeft: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
	},
	appLockIconContainer: {
		marginRight: 12,
	},
	appLockTextContainer: {
		flex: 1,
	},
	appLockTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: Colors.almostWhite,
		marginBottom: 4,
	},
	appLockDescription: {
		fontSize: 14,
		color: Colors.dirtyWhite,
		lineHeight: 18,
	},
});
