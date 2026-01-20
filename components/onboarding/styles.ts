import { StyleSheet } from 'react-native';

// Shared onboarding styles, extracted from the legacy single-screen onboarding.
export const onboardingStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    flexGrow: 1,
  },
  centeredScrollContent: {
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  logo: {
    width: '60%',
    height: 60,
  },
  pageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  scrollPageContainer: {
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  stepWrapper: {
    flex: 1,
    width: '100%',
  },
  footer: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 32,
  },
  footerStack: {
    gap: 12,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
    opacity: 0.7,
  },
  // Feature Cards
  featureContainer: {
    width: '100%',
    marginBottom: 30,
    gap: 15,
  },
  featureCard: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  featureTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
  },
  // Warning Step
  warningIconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#f39c12',
  },
  warningCard: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
  },
  warningCardTitle: {
    fontSize: 18,
    marginBottom: 10,
    textAlign: 'center',
  },
  warningCardTitleSmall: {
    fontSize: 16,
  },
  warningText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.8,
  },
  warningTextSmall: {
    fontSize: 14,
    lineHeight: 20,
  },
  warningPointsContainer: {
    width: '100%',
    marginBottom: 40,
    gap: 15,
  },
  warningPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  warningPointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  // Choice Step
  choiceButton: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  choiceButtonTitle: {
    fontSize: 18,
    textAlign: 'center',
  },
  choiceButtonDescription: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 18,
  },
  // Buttons
  buttonGroup: {
    width: '100%',
    gap: 15,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    marginVertical: 5,
  },
  buttonText: {
    fontSize: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  buttonIcon: {
    marginLeft: 8,
  },
  finishButton: {
    marginTop: 10,
  },
  copyButton: {
    marginTop: 30,
  },
  // Seed Generation
  seedContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
  },
  wordContainer: {
    width: '45%',
    padding: 12,
    margin: 5,
    borderRadius: 8,
  },
  wordText: {
    textAlign: 'center',
    fontSize: 16,
  },
  // Import
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    borderRadius: 8,
    padding: 15,
    minHeight: 44,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  // Splash
  splashContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  splashLogo: {
    width: '70%',
    height: '30%',
    maxWidth: 300,
  },
  // Verification
  verificationContainer: {
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
    gap: 15,
  },
  verificationText: {
    fontSize: 16,
    marginBottom: 5,
    textAlign: 'center',
    fontWeight: '600',
  },
  verificationInput: {
    width: '100%',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 10,
  },
  pinIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pinSetupFull: {
    justifyContent: 'center',
  },
  pinSetupContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  pinKeypadContainer: {
    width: '100%',
    marginTop: 10,
    alignItems: 'center',
  },
  pinErrorContainer: {
    minHeight: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pinErrorText: {
    textAlign: 'center',
  },
  pinSavingText: {
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 14,
    opacity: 0.8,
  },
  loadingSpinner: {
    marginTop: 30,
    marginBottom: 20,
  },
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    position: 'relative',
    minHeight: 56,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
  },
  headerLogoWrapper: {
    padding: 8,
    marginRight: -30,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  importPageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },
  importTextContainer: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  footerCompact: {
    marginBottom: -50,
  },
});

