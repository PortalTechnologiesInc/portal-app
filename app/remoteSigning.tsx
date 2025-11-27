import React, { useMemo } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles } from 'lucide-react-native';

import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';

type ClientConnection = {
    id: string;
    screenName: string;
    isNew?: boolean;
};

const placeholderConnections: ClientConnection[] = [
    {
        id: 'bunker-home',
        screenName: 'Portal Desktop',
    },
    {
        id: 'satshoot',
        screenName: 'SatShoot Node',
    },
    {
        id: 'coracle',
        screenName: 'Coracle Web Client',
        isNew: true,
    },
    {
        id: 'satshoot',
        screenName: 'SatShoot Node',
    },
    {
        id: 'satshoot',
        screenName: 'SatShoot Node',
    },
    {
        id: 'satshoot',
        screenName: 'SatShoot Node',
    },
    {
        id: 'satshoot',
        screenName: 'SatShoot Node',
    },
    {
        id: 'satshoot',
        screenName: 'SatShoot Node',
    },
];

const RemoteSigningScreen = () => {
    const backgroundColor = useThemeColor({}, 'background');
    const surfaceColor = useThemeColor({}, 'surfaceSecondary');
    const cardBackground = useThemeColor({}, 'cardBackground');
    const textPrimary = useThemeColor({}, 'textPrimary');
    const textSecondary = useThemeColor({}, 'textSecondary');
    const badgeBackground = useThemeColor({}, 'buttonPrimary');
    const badgeTextColor = useThemeColor({}, 'buttonPrimaryText');

    const connections = useMemo(() => placeholderConnections, []);
    const usageCopy = 'Last used within the last 2 months';

    const renderConnection = ({ item, index }: { item: ClientConnection; index: number }) => (
        <TouchableOpacity
            style={[styles.connectionCard, { backgroundColor: cardBackground }]}
            activeOpacity={0.9}
            onPress={() => router.push({ pathname: '/bunkerConnectionDetails/[id]', params: { id: item.id } })}
        >
            {item.isNew && (
                <View style={[styles.badgeOverlay, { backgroundColor: badgeBackground }]}>
                    <ThemedText style={[styles.badgeText, { color: badgeTextColor }]}>New</ThemedText>
                </View>
            )}
            <View style={styles.connectionHeader}>
                <ThemedText style={[styles.connectionIndex, { color: textSecondary }]}>
                    {String(index + 1).padStart(2, '0')}
                </ThemedText>
                <ThemedText style={[styles.connectionTitle, { color: textPrimary }]}>
                    {item.screenName}
                </ThemedText>
            </View>
            <ThemedText style={[styles.connectionDescription, { color: textSecondary }]}>
                {usageCopy}
            </ThemedText>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
            <ThemedView style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={20} color={textPrimary} />
                </TouchableOpacity>
                <ThemedText style={[styles.headerText, { color: textPrimary }]}>
                    Remote Signing
                </ThemedText>
            </ThemedView>
            <ThemedView style={styles.container}>
                <View style={[styles.hero, { backgroundColor: surfaceColor }]}>
                    <View style={styles.heroIcon}>
                        <Sparkles size={20} color={textPrimary} />
                    </View>
                    <View style={styles.heroCopy}>
                        <ThemedText style={[styles.heroTitle, { color: textPrimary }]}>
                            Remote signing with style
                        </ThemedText>
                        <ThemedText style={[styles.heroSubtitle, { color: textSecondary }]}>
                            Connect your Nostr clients via NostrConnect Bunker. This standard keeps keys
                            sealed while clients request Portal signature over secure relays.
                        </ThemedText>
                    </View>
                </View>

                <ThemedText style={[styles.sectionLabel, { color: textSecondary }]}>
                    Active connections
                </ThemedText>
            </ThemedView>
            <FlatList
                data={connections}
                keyExtractor={item => item.id}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={renderConnection}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    backButton: {
        marginRight: 15,
    },
    headerText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    container: {
        marginHorizontal: 20,
        marginTop: 24,
    },
    list: {
    },
    hero: {
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 28,
    },
    heroIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    heroCopy: {
        flex: 1,
    },
    heroTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 6,
    },
    heroSubtitle: {
        fontSize: 14,
        lineHeight: 20,
    },
    sectionLabel: {
        fontSize: 13,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    listContent: {
        paddingBottom: 40,
        marginHorizontal: 20,
    },
    connectionCard: {
        borderRadius: 14,
        padding: 18,
        position: 'relative',
        overflow: 'visible',
    },
    connectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    connectionIndex: {
        fontSize: 13,
        fontWeight: '600',
        marginRight: 12,
    },
    connectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
    },
    badgeOverlay: {
        position: 'absolute',
        top: -5,
        left: -7,
        paddingHorizontal: 4,
        borderRadius: 10,
        zIndex: 1,
        transform: [{ rotate: '-25deg' }],
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '600',
    },
    connectionDescription: {
        fontSize: 13,
        marginTop: 6,
    },
    separator: {
        height: 14,
    },
});

export default RemoteSigningScreen;