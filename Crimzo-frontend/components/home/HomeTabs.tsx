import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
    activeTab: string;
    onChangeTab: (tab: string) => void;
}

const TABS = [
    { key: 'for-you', label: '🔥 Popular Live' },
    { key: 'gaming', label: '⚡ PK Battles' },
];

const HomeTabs: React.FC<Props> = ({ activeTab, onChangeTab }) => {
    return (
        <View style={s.wrapper}>
            <View style={s.row}>
                {TABS.map((tab) => {
                    const active = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[s.pill, active && s.pillActive]}
                            onPress={() => onChangeTab(tab.key)}
                            activeOpacity={0.7}
                        >
                            <Text style={[s.pillText, active && s.pillTextActive]}>{tab.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const s = StyleSheet.create({
    wrapper: { paddingBottom: 4 },
    row: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
    pill: {
        flex: 1,
        paddingVertical: 10, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
    },
    pillActive: {
        backgroundColor: '#FF2D55', borderColor: '#FF2D55',
    },
    pillText: { color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '700' },
    pillTextActive: { color: '#FFF' },
});

export default HomeTabs;
