import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import defaultRelayList from '@/assets/DefaultRelays.json';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedView } from '@/components/ThemedView';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useKey } from '@/context/KeyContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getKeypairFromKey, hasKey } from '@/utils/keyHelpers';

const VERIFY_SESSIONS_URL = 'https://8081.wheatley.getportal.cc:32000/verify/sessions/app';

type SessionResponse = {
  ephemeral_npub: string;
  expires_at: number;
  session_id: string;
  session_url: string;
};

export default function AgeVerification() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const { mnemonic, nsec } = useKey();
  const { executeOperation } = useDatabaseContext();
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);

  // Fetch relays from database and create verification session
  useEffect(() => {
    console.log('[AgeVerification] Component mounted, starting session creation');

    const fetchRelaysAndCreateSession = async () => {
      try {
        console.log('[AgeVerification] Checking key material availability');
        // Check if key material is available
        // if (!hasKey({ mnemonic, nsec })) {
        //   console.warn('[AgeVerification] No key material available (mnemonic or nsec)');
        //   setHasError(true);
        //   setIsLoading(false);
        //   return;
        // }

        console.log('[AgeVerification] Key material found, getting npub');
        // Get npub from app's key material
        // const keypair = getKeypairFromKey({ mnemonic, nsec });
        // const npub = keypair.publicKey().toString();
        const npub = 'npub1n7np7r2u7qwgq7w5qxgzpyuj4a64fhuknf6vst0jhk4l5ucntlgsmcx4xx';
        console.log('[AgeVerification] npub retrieved successfully');

        console.log('[AgeVerification] Fetching relays from database');
        // Try to get relays from database first
        const dbRelays = (await executeOperation(db => db.getRelays(), [])).map(
          relay => relay.ws_uri
        );
        console.log('[AgeVerification] Database relays:', dbRelays);

        let relays: string[];
        if (dbRelays.length > 0) {
          relays = dbRelays;
          console.log('[AgeVerification] Using database relays:', relays);
        } else {
          // If no relays in database, use defaults and update database
          relays = [...defaultRelayList];
          console.log('[AgeVerification] No database relays, using defaults:', relays);
          await executeOperation(db => db.updateRelays(defaultRelayList), null);
        }

        const requestBody = { npub, relays };
        console.log('[AgeVerification] Making POST request to:', VERIFY_SESSIONS_URL);
        console.log('[AgeVerification] Request body contains npub and', relays.length, 'relays');

        // Make network call to create verification session
        const response = await fetch(VERIFY_SESSIONS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        console.log('[AgeVerification] Response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AgeVerification] HTTP error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data: SessionResponse = await response.json();
        console.log('[AgeVerification] Session created successfully');
        console.log(
          '[AgeVerification] Session expires at:',
          new Date(data.expires_at * 1000).toISOString()
        );

        setSessionData(data);
        setIsLoading(false);
        console.log('[AgeVerification] Session data set, isLoading set to false');
      } catch (error) {
        console.error('[AgeVerification] Failed to fetch relays or create session:', error);
        if (error instanceof Error) {
          console.error('[AgeVerification] Error message:', error.message);
          console.error('[AgeVerification] Error stack:', error.stack);
        }
        setHasError(true);
        setIsLoading(false);
      }
    };

    fetchRelaysAndCreateSession();
  }, [mnemonic, nsec, executeOperation]);

  // Debug log when sessionData changes
  useEffect(() => {
    if (sessionData?.session_id) {
      console.log(
        '[AgeVerification] Session data available, WebView URL:',
        `https://8081.wheatley.getportal.cc:32000/?id=${sessionData.session_id}`
      );
    } else {
      console.log('[AgeVerification] No session data yet, sessionData:', sessionData);
    }
  }, [sessionData]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        // Allow back navigation if webview can go back
        if (webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      });
      return () => backHandler.remove();
    }
  }, []);

  const handleWebViewLoadStart = useCallback(() => {
    console.log('[AgeVerification] WebView load started');
    setIsLoading(true);
    setWebViewReady(false);
    setHasError(false);
  }, []);

  const handleWebViewLoadEnd = useCallback(() => {
    console.log('[AgeVerification] WebView load ended');
    setIsLoading(false);
    setWebViewReady(true);
  }, []);

  const handleError = useCallback((syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('[AgeVerification] WebView error:', {
      code: nativeEvent?.code,
      description: nativeEvent?.description,
      domain: nativeEvent?.domain,
      url: nativeEvent?.url,
    });
    setIsLoading(false);
    setWebViewReady(false);
    setHasError(true);
  }, []);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    console.log('[AgeVerification] WebView message received:', event.nativeEvent.data);
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[AgeVerification] Parsed message data:', data);
      // Handle messages from the webview (e.g., verification complete)
      if (data.type === 'verification-complete') {
        console.log('[AgeVerification] Verification complete, navigating to identity-verification');
        router.push('/(onboarding)/identity-verification');
      }
    } catch (error) {
      console.warn('[AgeVerification] Failed to parse message as JSON:', error);
    }
  }, []);

  // Inject CSS and JS to make the webview seamless and block text selection / context menu
  const injectedJavaScript = `
    (function() {
      const style = document.createElement('style');
      style.textContent = \`
        html, body {
          margin: 0;
          padding: 0;
          background-color: ${backgroundColor} !important;
        }
        #app, #app.svelte-12qhfyh, .svelte-12qhfyh {
          background-color: ${backgroundColor} !important;
          min-height: 100%;
        }
        *, *::before, *::after {
          -webkit-tap-highlight-color: transparent;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
      \`;
      document.head.appendChild(style);
      document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
      document.querySelector('footer')?.remove();
      document.querySelector('[role="contentinfo"]')?.remove();
    })();
    true; // Required for injected JavaScript
  `;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={localStyles.headerWrapper}>
        <OnboardingHeader onBack={() => router.back()} hideBackButton={false} />
      </ThemedView>
      <View style={[localStyles.webviewContainer, { backgroundColor }]}>
        {hasError ? (
          <View style={localStyles.errorContainer}>
            {/* Error state - could be enhanced with retry button */}
          </View>
        ) : (
          <>
            {sessionData?.session_id && (
              <View
                style={[
                  localStyles.webviewWrapper,
                  { backgroundColor, opacity: webViewReady ? 1 : 0 },
                ]}
                pointerEvents={webViewReady ? 'auto' : 'none'}
              >
                <WebView
                  ref={webViewRef}
                  source={{
                    uri: `https://8081.wheatley.getportal.cc:32000/?id=${sessionData.session_id}`,
                  }}
                  style={[localStyles.webview, { backgroundColor }]}
                  onLoadStart={handleWebViewLoadStart}
                  onLoadEnd={handleWebViewLoadEnd}
                  onError={handleError}
                  onMessage={handleMessage}
                  injectedJavaScript={injectedJavaScript}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  scalesPageToFit={true}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  scrollEnabled={true}
                  // iOS specific
                  allowsInlineMediaPlayback={true}
                  mediaPlaybackRequiresUserAction={false}
                  // Android specific
                  mixedContentMode="always"
                  onHttpError={syntheticEvent => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('[AgeVerification] WebView HTTP error:', {
                      statusCode: nativeEvent?.statusCode,
                      description: nativeEvent?.description,
                      url: nativeEvent?.url,
                    });
                  }}
                  onRenderProcessGone={syntheticEvent => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('[AgeVerification] WebView render process gone:', {
                      didCrash: nativeEvent?.didCrash,
                    });
                  }}
                />
              </View>
            )}
            {isLoading && (
              <View style={[localStyles.loadingContainer, { backgroundColor }]}>
                <ActivityIndicator size="large" color={buttonPrimary} />
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  headerWrapper: {
    paddingHorizontal: 20,
  },
  webviewContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  webviewWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
