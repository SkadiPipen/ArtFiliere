import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";


type User = {
    id: number;
    name: string;
    username: string;
    email: string;
    phone: number;
}


export default function ApiTest() {
    const [users, setUsers] = useState<User[]>([]);
    useEffect(() => {
        fetch("https://jsonplaceholder.typicode.com/users")
            .then((response) => response.json())
            .then((data) => {
                console.log(data[0]);
                setUsers(data);
            });
    }, []);
    return (
        <View style={styles.container}>
            <Text style={styles.title}>API Test</Text>

            {users.map((user) => (
                <View key={user.id} style={styles.card}>
                    <Text>Name: {user.name}</Text>
                    <Text>Username: {user.username}</Text>
                    <Text>Email: {user.email}</Text>
                    <Text>Phone: {user.phone}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },

    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
    },

    card: {
        backgroundColor: "#f2f2f2",
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
});