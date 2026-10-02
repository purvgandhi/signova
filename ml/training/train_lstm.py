import numpy as np
import os
from sklearn.model_selection import train_test_split
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.utils import to_categorical
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
MODEL_SAVE_PATH = str(REPO_ROOT / 'models' / 'lstm_gesture_model.keras')
LABELS_SAVE_PATH = str(REPO_ROOT / 'models' / 'lstm_gesture_labels.pkl')

print("Loading gesture data...")

X = []
y = []

for label_index, gesture in enumerate(GESTURES):
    gesture_folder = os.path.join(DATA_FOLDER, gesture)
    if not os.path.exists(gesture_folder):
        print(f"WARNING: No data found for '{gesture}' — skipping")
        continue

    files = [f for f in os.listdir(gesture_folder) if f.endswith('.npy')]
    for file in files:
        recording = np.load(os.path.join(gesture_folder, file))
        X.append(recording)
        y.append(label_index)

    print(f"  Loaded {len(files)} recordings for '{gesture}'")

X = np.array(X)
y = np.array(y)

print(f"\nTotal samples: {len(X)}")
print(f"Input shape: {X.shape}")
print(f"Number of gestures: {len(GESTURES)}")

# One-hot encode labels
y_categorical = to_categorical(y, num_classes=len(GESTURES))

# Split into train and test
X_train, X_test, y_train, y_test = train_test_split(
    X, y_categorical, test_size=0.2, random_state=42
)

print(f"\nTraining samples: {len(X_train)}")
print(f"Testing samples:  {len(X_test)}")

# ---- BUILD LSTM MODEL ----
print("\nBuilding LSTM model...")

model = Sequential()
model.add(LSTM(64, return_sequences=True, input_shape=(30, 126)))
model.add(Dropout(0.3))
model.add(LSTM(128, return_sequences=True))
model.add(Dropout(0.3))
model.add(LSTM(64, return_sequences=False))
model.add(Dropout(0.3))
model.add(Dense(64, activation='relu'))
model.add(Dropout(0.2))
model.add(Dense(len(GESTURES), activation='softmax'))

model.compile(
    optimizer='adam',
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.summary()

# ---- TRAIN ----
print("\nTraining... (5-10 minutes)")

# Stop early if accuracy stops improving
early_stop = EarlyStopping(
    monitor='val_accuracy',
    patience=15,
    restore_best_weights=True
)

history = model.fit(
    X_train, y_train,
    epochs=100,
    batch_size=32,
    validation_data=(X_test, y_test),
    callbacks=[early_stop]
)

# ---- SAVE MODEL MANUALLY ----
print("\nSaving model...")
model.save(MODEL_SAVE_PATH)

# ---- EVALUATE ----
loss, accuracy = model.evaluate(X_test, y_test)
print(f"\nFinal Test Accuracy: {accuracy * 100:.1f}%")

# Save labels
with open(LABELS_SAVE_PATH, 'wb') as f:
    pickle.dump(GESTURES, f)

print(f"\nModel saved as '{MODEL_SAVE_PATH}'")
print(f"Labels saved as '{LABELS_SAVE_PATH}'")
print("You can now run realtime_lstm.py")