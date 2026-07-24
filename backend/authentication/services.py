from firebase_admin import auth

def verify_token(id_token):
    
    decoded_token = auth.verify_id_token(id_token)

    return decoded_token