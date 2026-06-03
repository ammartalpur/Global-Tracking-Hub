declare module "@clerk/nextjs" {
  export interface ClerkContextValue {
    getToken: (options?: { template?: string }) => Promise<string | null>;
    userId?: string;
    user?: any;
    isSignedIn?: boolean;
    isLoaded?: boolean;
    signOut?: () => Promise<void>;
    openUserProfile?: () => void;
  }

  export function useAuth(): ClerkContextValue;
  export function useUser(): any;
  export function useClerk(): any;
  export function SignInButton(props: any): JSX.Element;
  export function SignUpButton(props: any): JSX.Element;
  export function UserButton(props?: any): JSX.Element;
  export function Show(props: any): JSX.Element;
  export function ClerkProvider(props: {
    children: React.ReactNode;
    appearance?: any;
  }): JSX.Element;
}
