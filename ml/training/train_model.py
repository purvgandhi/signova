import numpy as np
import os
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import pickle

# ---- SETTINGS ----
GESTURES = [
    'accident', 'bad', 'call', 'doctor', 'food',
    'good', 'happy', 'hello', 'help', 'home',
    'hot', 'lose', 'more', 'name', 'no',
    'pain', 'please', 'school', 'stop', 'thankyou',
    'thief', 'water', 'what', 'where', 'yes'
]
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
DATA_FOLDER = str(REPO_ROOT / 'data' / 'gesture_data')
MODEL_SAVE_PATH = str(REPO_ROOT / 'models' / 'gesture_model.pkl')
LABELS_SAVE_PATH = str(REPO_ROOT / 'models' / 'gesture_labels.pkl')

print("Loading gesture data...")

X = []  # Features (landmark data)
y = []  # Labels (gesture names)

# Load all saved recordings
for label_index, gesture in enumerate(GESTURES):
    gesture_folder = os.path.join(DATA_FOLDER, gesture)
    files = os.listdir(gesture_folder)

    for file in files:
        if file.endswith('.npy'):
            # Load the 30 frame recording
            recording = np.load(os.path.join(gesture_folder, file))

            # Flatten: 30 frames x 63 values = 1890 values per recording
            flattened = recording.flatten()
            X.append(flattened)
            y.append(label_index)

    print(f"  Loaded {len(files)} recordings for '{gesture}'")

X = np.array(X)
y = np.array(y)

print(f"\nTotal samples: {len(X)}")
print(f"Features per sample: {X.shape[1]}")

# Split into training and testing sets (80% train, 20% test)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"\nTraining samples: {len(X_train)}")
print(f"Testing samples: {len(X_test)}")

# Train a Random Forest classifier
print("\nTraining the model... (this takes 1-2 minutes)")
model = RandomForestClassifier(
    n_estimators=100,   # 100 decision trees
    random_state=42,
    n_jobs=-1           # Use all CPU cores
)
model.fit(X_train, y_train)

# Test accuracy
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)

print(f"\nModel trained!")
print(f"Accuracy: {accuracy * 100:.1f}%")
print("\nDetailed report:")
print(classification_report(y_test, y_pred, target_names=GESTURES))

# Save the model to a file
with open(MODEL_SAVE_PATH, 'wb') as f:
    pickle.dump(model, f)

# Save gesture labels too
with open(LABELS_SAVE_PATH, 'wb') as f:
    pickle.dump(GESTURES, f)

print(f"\nModel saved as '{MODEL_SAVE_PATH}'")
print(f"Labels saved as '{LABELS_SAVE_PATH}'")
print("You can now run realtime_recognition.py")