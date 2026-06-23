import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type ModalProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  keyboardOffset?: number;
  avoidKeyboard?: boolean;
  includeTopInset?: boolean;
};

export function KeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = 'interactive',
  automaticallyAdjustKeyboardInsets = true,
  keyboardOffset,
  avoidKeyboard = true,
  includeTopInset = false,
  ...rest
}: KeyboardAwareScrollViewProps) {
  const insets = useSafeAreaInsets();
  const offset = keyboardOffset ?? (includeTopInset ? insets.top : 0);

  const scroll = (
    <ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
      showsVerticalScrollIndicator={rest.showsVerticalScrollIndicator ?? false}
      {...rest}
    >
      {children}
    </ScrollView>
  );

  if (!avoidKeyboard) return scroll;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={KEYBOARD_BEHAVIOR}
      keyboardVerticalOffset={offset}
    >
      {scroll}
    </KeyboardAvoidingView>
  );
}

export function KeyboardModalFrame({
  children,
  style,
  offset,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  offset?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={KEYBOARD_BEHAVIOR}
      keyboardVerticalOffset={offset ?? insets.top}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

type KeyboardSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  animationType?: ModalProps['animationType'];
};

/** Bottom sheet with keyboard lift — use for modals that contain TextInput */
export function KeyboardSheet({
  visible,
  onClose,
  children,
  animationType = 'slide',
}: KeyboardSheetProps) {
  return (
    <Modal visible={visible} transparent animationType={animationType} onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetRoot} behavior={KEYBOARD_BEHAVIOR}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          bounces={false}
          contentContainerStyle={styles.sheetScroll}
        >
          <View onStartShouldSetResponder={() => true}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetScroll: { flexGrow: 0 },
});