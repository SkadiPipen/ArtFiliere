import { createContext } from "react";
import { User } from "firebase/auth";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  readOnly: boolean;
  setReadOnly: (value: boolean) => void;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  readOnly: false,
  setReadOnly: () => {},
});
