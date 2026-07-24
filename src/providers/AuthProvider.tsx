import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/firebase/config';
import { AuthContext } from '@/context/AuthContext';

export function AuthProvider({
    children,
}:{
    children: React.ReactNode;
}){

    const [user,setUser] =
        useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(()=>{

        const unsubscribe =
            onAuthStateChanged(
                auth,
                (currentUser)=>{

                    setUser(currentUser);
                    setLoading(false);

                }
            );

        return unsubscribe;

    },[]);

    return(

        <AuthContext.Provider
            value={{user, loading}}
        >
            {children}
        </AuthContext.Provider>

    );

}