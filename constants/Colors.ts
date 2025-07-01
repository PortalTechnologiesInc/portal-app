/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * All colors should be theme-aware and centralized here.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    // Basic theme colors
    text: '#11181C',
    background: '#F1F1F1',
    cardBackground: '#ffffff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,

    // Surface colors
    surfacePrimary: '#ffffff',
    surfaceSecondary: '#f8f9fa',
    surfaceTertiary: '#e9ecef',

    // Text colors
    textPrimary: '#11181C',
    textSecondary: '#687076',
    textTertiary: '#adb5bd',
    textInverse: '#ffffff',

    // Border colors
    borderPrimary: '#dee2e6',
    borderSecondary: '#e9ecef',
    borderFocus: '#0a7ea4',

    // Shadow and overlay colors
    shadowColor: '#000000',
    overlayBackground: 'rgba(0, 0, 0, 0.3)',
    modalBackground: 'rgba(0, 0, 0, 0.5)',

    // Input colors
    inputBackground: '#ffffff',
    inputBorder: '#dee2e6',
    inputPlaceholder: '#adb5bd',

    // Status colors
    statusConnected: '#28a745',
    statusConnecting: '#ffc107',
    statusDisconnected: '#dc3545',
    statusError: '#dc3545',
    statusWarning: '#ffc107',

    // Button colors
    buttonPrimary: '#0a7ea4',
    buttonPrimaryText: '#ffffff',
    buttonSecondary: '#e9ecef',
    buttonSecondaryText: '#495057',
    buttonDanger: '#dc3545',
    buttonDangerText: '#ffffff',
    buttonSuccess: '#27ae60',
    buttonSuccessText: '#ffffff',

    // Skeleton/loading colors
    skeletonBase: '#e9ecef',
    skeletonHighlight: '#f8f9fa',
  },
  dark: {
    // Basic theme colors
    text: '#ECEDEE',
    background: '#000000',
    cardBackground: '#1E1E1E',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,

    // Surface colors
    surfacePrimary: '#1E1E1E',
    surfaceSecondary: '#2d2d2d',
    surfaceTertiary: '#3d3d3d',

    // Text colors
    textPrimary: '#ECEDEE',
    textSecondary: '#9BA1A6',
    textTertiary: '#6c757d',
    textInverse: '#000000',

    // Border colors
    borderPrimary: '#3d3d3d',
    borderSecondary: '#2d2d2d',
    borderFocus: '#ffffff',

    // Shadow and overlay colors
    shadowColor: '#000000',
    overlayBackground: 'rgba(0, 0, 0, 0.75)',
    modalBackground: 'rgba(0, 0, 0, 0.8)',

    // Input colors
    inputBackground: '#2d2d2d',
    inputBorder: '#3d3d3d',
    inputPlaceholder: '#6c757d',

    // Status colors
    statusConnected: '#28a745',
    statusConnecting: '#ffc107',
    statusDisconnected: '#dc3545',
    statusError: '#dc3545',
    statusWarning: '#ffc107',

    // Button colors
    buttonPrimary: '#0a7ea4',
    buttonPrimaryText: '#ffffff',
    buttonSecondary: '#3d3d3d',
    buttonSecondaryText: '#ECEDEE',
    buttonDanger: '#dc3545',
    buttonDangerText: '#ffffff',
    buttonSuccess: '#27ae60',
    buttonSuccessText: '#ffffff',

    // Skeleton/loading colors
    skeletonBase: '#2d2d2d',
    skeletonHighlight: 'rgba(255, 255, 255, 0.1)',
  },

  // Legacy colors - keeping for backward compatibility but should be migrated
  almostWhite: '#e6e6e6',
  dirtyWhite: '#bfbfbf',
  gray: '#b3b3b3',
  unselectedGray: '#687076',
  darkGray: '#222222',
  darkerGray: '#0c0c0c',
  green: '#004f4e',
  red: '#710729',

  // Major palette colors
  primary: '#0a7ea4',
  primaryLight: '#4fb3d9',
  primaryDark: '#005a75',
  secondary: '#f39c12',
  secondaryLight: '#f7dc6f',
  secondaryDark: '#d68910',

  // Semantic colors
  success: '#27ae60',
  successLight: '#58d68d',
  successDark: '#1e8449',
  warning: '#f39c12',
  warningLight: '#f7dc6f',
  warningDark: '#d68910',
  error: '#e74c3c',
  errorLight: '#ec7063',
  errorDark: '#c0392b',
  info: '#3498db',
  infoLight: '#85c1e9',
  infoDark: '#2874a6',

  // Neutral palette
  white: '#ffffff',
  secondaryWhite: '#ffffff',
  primaryWhite: '#F1F1F1',
  black: '#000000',
  gray100: '#f8f9fa',
  gray200: '#e9ecef',
  gray300: '#dee2e6',
  gray400: '#ced4da',
  gray500: '#adb5bd',
  gray600: '#6c757d',
  gray700: '#495057',
  gray800: '#343a40',
  gray900: '#212529',

  // Accent colors
  purple: '#9b59b6',
  purpleLight: '#bb8fce',
  purpleDark: '#7d3c98',
  orange: '#e67e22',
  orangeLight: '#f0b27a',
  orangeDark: '#ca6f1e',
  teal: '#1abc9c',
  tealLight: '#76d7c4',
  tealDark: '#148f77',
};
