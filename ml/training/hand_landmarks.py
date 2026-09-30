import cv2
import mediapipe as mp

# Set up MediaPipe hands module
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

# Configure the hand detector
# max_num_hands=1 means detect only one hand (simpler for now)
# min_detection_confidence=0.7 means 70% sure before detecting
hands = mp_hands.Hands(
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# Open webcam — CAP_DSHOW fixes black screen issue on Windows
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("Hand detection started! Press Q to quit.")
print("Put your hand in front of the camera.")

while True:
    ret, frame = cap.read()
    if not ret:
        print("Cannot read camera.")
        break

    # Flip the frame so it acts like a mirror
    frame = cv2.flip(frame, 1)

    # MediaPipe needs RGB, but OpenCV gives BGR — convert it
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Process the frame to find hands
    result = hands.process(rgb_frame)

    # If a hand is found
    if result.multi_hand_landmarks:
        for hand_landmarks in result.multi_hand_landmarks:

            # Draw the skeleton (21 dots + connections) on the frame
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS
            )

            # Print the x,y position of the wrist (landmark 0) in terminal
            wrist = hand_landmarks.landmark[0]
            print(f"Wrist position: x={wrist.x:.2f}, y={wrist.y:.2f}")

    else:
        # Show message when no hand is detected
        cv2.putText(frame, "No hand detected - show your hand!", (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

    # Show the frame
    cv2.imshow("Hand Landmarks", frame)

    # Press Q to quit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Clean up
cap.release()
cv2.destroyAllWindows()
print("Done.")